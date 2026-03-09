import { preload, removeBackground } from '@imgly/background-removal';

type StickerWorkerRequest =
  | {
      id: number;
      action: 'warmupStickerEngine';
    }
  | {
      id: number;
      action: 'processSticker';
      payload: {
        file: Blob;
        maxDim?: number;
        thumbnailMaxDim?: number;
      };
    };

type StickerWorkerProgress = {
  id: number;
  type: 'progress';
  progress: number;
  stage: string;
};

type StickerModelConfig = {
  device: 'cpu' | 'gpu';
  model: 'isnet' | 'isnet_fp16' | 'isnet_quint8';
  output: {
    format: 'image/png';
    quality: number;
    type: 'foreground';
  };
};

type StickerPayload = {
  stickerBlob: Blob;
  thumbnailBlob: Blob;
  width: number;
  height: number;
};

type StickerWorkerPartial = {
  id: number;
  type: 'partial';
  result: StickerPayload;
};

type StickerWorkerResult = {
  id: number;
  type: 'result';
  result:
    | {
        ok: true;
      }
    | StickerPayload;
};

type StickerWorkerError = {
  id: number;
  type: 'error';
  error: string;
};

function postProgress(id: number, progress: number, stage: string) {
  const message: StickerWorkerProgress = { id, type: 'progress', progress, stage };
  self.postMessage(message);
}

const stickerEngineConfig: StickerModelConfig = {
  device: typeof navigator !== 'undefined' && 'gpu' in navigator ? ('gpu' as const) : ('cpu' as const),
  model: 'isnet_quint8' as const,
  output: {
    format: 'image/png' as const,
    quality: 0.9,
    type: 'foreground' as const,
  },
};

const stickerRefineConfig: StickerModelConfig = {
  ...stickerEngineConfig,
  model: 'isnet_fp16' as const,
};

let warmupPromise: Promise<void> | null = null;
const lastProgressByJob = new Map<number, { progress: number; stage: string; at: number }>();

function postProgressThrottled(id: number, progress: number, stage: string) {
  const now = Date.now();
  const previous = lastProgressByJob.get(id);

  if (
    previous &&
    previous.stage === stage &&
    progress - previous.progress < 4 &&
    now - previous.at < 120
  ) {
    return;
  }

  lastProgressByJob.set(id, { progress, stage, at: now });
  postProgress(id, progress, stage);
}

function warmStickerEngine() {
  if (!warmupPromise) {
    warmupPromise = preload(stickerEngineConfig).then(() => undefined);
  }
  return warmupPromise;
}

async function blobToImageBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

async function canvasToBlob(canvas: OffscreenCanvas, type: string, quality?: number): Promise<Blob> {
  return canvas.convertToBlob({ type, quality });
}

async function resizeImage(blob: Blob, maxDim = 800): Promise<Blob> {
  const image = await blobToImageBitmap(blob);
  let { width, height } = image;

  if (width <= maxDim && height <= maxDim) {
    image.close();
    return blob;
  }

  if (width > height) {
    height = Math.floor(height * (maxDim / width));
    width = maxDim;
  } else {
    width = Math.floor(width * (maxDim / height));
    height = maxDim;
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: true });

  if (!ctx) {
    image.close();
    return blob;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, width, height);
  image.close();

  const type = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const quality = type === 'image/jpeg' ? 0.9 : undefined;
  return canvasToBlob(canvas, type, quality);
}

async function autoCropTransparentImage(blob: Blob): Promise<Blob> {
  const image = await blobToImageBitmap(blob);
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) {
    image.close();
    return blob;
  }

  ctx.drawImage(image, 0, 0);
  image.close();

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = 0;
  let maxY = 0;
  let hasPixels = false;

  const alphaThreshold = 25;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const alpha = data[(y * canvas.width + x) * 4 + 3];
      if (alpha > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        hasPixels = true;
      }
    }
  }

  if (!hasPixels) {
    return blob;
  }

  const padding = 2;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(canvas.width - 1, maxX + padding);
  maxY = Math.min(canvas.height - 1, maxY + padding);

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;

  if (cropWidth >= canvas.width - 4 && cropHeight >= canvas.height - 4) {
    return blob;
  }

  const croppedCanvas = new OffscreenCanvas(cropWidth, cropHeight);
  const croppedCtx = croppedCanvas.getContext('2d', { alpha: true });

  if (!croppedCtx) {
    return blob;
  }

  croppedCtx.drawImage(canvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return canvasToBlob(croppedCanvas, 'image/png');
}

async function getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const image = await blobToImageBitmap(blob);
  const dimensions = { width: image.width, height: image.height };
  image.close();
  return dimensions;
}

async function createThumbnail(blob: Blob, maxThumb = 200): Promise<Blob> {
  const image = await blobToImageBitmap(blob);
  const scale = Math.min(maxThumb / image.width, maxThumb / image.height, 1);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: true });

  if (!ctx) {
    image.close();
    return blob;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, width, height);
  image.close();

  return canvasToBlob(canvas, 'image/png');
}

async function runStickerPass(
  file: Blob,
  options: {
    maxDim: number;
    thumbnailMaxDim: number;
    config: StickerModelConfig;
    onProgress: (progress: number, stage: string) => void;
  }
): Promise<StickerPayload> {
  options.onProgress(4, 'Preparing image');
  const resizedBlob = await resizeImage(file, options.maxDim);

  options.onProgress(12, 'Loading sticker engine');
  await warmStickerEngine();

  const rawStickerBlob = await removeBackground(resizedBlob, {
    ...options.config,
    progress: (_key: string, current: number, total: number) => {
      if (total > 0) {
        const normalized = 12 + Math.round((current / total) * 76);
        options.onProgress(Math.min(normalized, 88), 'Removing background');
      }
    },
  });

  options.onProgress(90, 'Cropping sticker');
  const stickerBlob = await autoCropTransparentImage(rawStickerBlob);
  const dimensions = await getImageDimensions(stickerBlob);

  options.onProgress(96, 'Rendering preview');
  const thumbnailBlob = await createThumbnail(stickerBlob, options.thumbnailMaxDim);

  return {
    stickerBlob,
    thumbnailBlob,
    width: dimensions.width,
    height: dimensions.height,
  };
}

async function processSticker(
  id: number,
  payload: { file: Blob; maxDim?: number; thumbnailMaxDim?: number }
) {
  const quickResult = await runStickerPass(payload.file, {
    maxDim: Math.min(payload.maxDim ?? 640, 512),
    thumbnailMaxDim: payload.thumbnailMaxDim ?? 160,
    config: stickerEngineConfig,
    onProgress: (progress, stage) => postProgressThrottled(id, progress, stage),
  });

  const partialMessage: StickerWorkerPartial = {
    id,
    type: 'partial',
    result: quickResult,
  };
  self.postMessage(partialMessage);

  postProgressThrottled(id, 72, 'Refining edges');
  const refinedResult = await runStickerPass(payload.file, {
    maxDim: Math.max(payload.maxDim ?? 640, 768),
    thumbnailMaxDim: payload.thumbnailMaxDim ?? 160,
    config: stickerRefineConfig,
    onProgress: (progress, stage) => {
      const mapped = stage === 'Removing background'
        ? 72 + Math.round(((progress - 12) / 76) * 22)
        : progress >= 90
          ? 95 + Math.round(((progress - 90) / 10) * 4)
          : progress;
      postProgressThrottled(id, Math.min(Math.max(mapped, 72), 99), stage === 'Removing background' ? 'Refining edges' : stage);
    },
  });

  const message: StickerWorkerResult = {
    id,
    type: 'result',
    result: refinedResult,
  };

  self.postMessage(message);
  lastProgressByJob.delete(id);
}

self.onmessage = (event: MessageEvent<StickerWorkerRequest>) => {
  const message = event.data;

  if (message.action === 'warmupStickerEngine') {
    warmStickerEngine()
      .then(() => {
        const output: StickerWorkerResult = {
          id: message.id,
          type: 'result',
          result: { ok: true },
        };
        self.postMessage(output);
      })
      .catch((error: unknown) => {
        const output: StickerWorkerError = {
          id: message.id,
          type: 'error',
          error: error instanceof Error ? error.message : 'Sticker warmup failed',
        };
        self.postMessage(output);
      });
    return;
  }

  processSticker(message.id, message.payload).catch((error: unknown) => {
    lastProgressByJob.delete(message.id);
    const output: StickerWorkerError = {
      id: message.id,
      type: 'error',
      error: error instanceof Error ? error.message : 'Sticker generation failed',
    };
    self.postMessage(output);
  });
};
