type StickerWorkerProgressHandler = (progress: number, stage: string) => void;
type StickerWorkerPartialHandler = (result: StickerWorkerPartial) => void;

type StickerWorkerSuccess = {
  stickerBlob: Blob;
  thumbnailBlob: Blob;
  width: number;
  height: number;
};

type StickerWorkerPartial = {
  stickerBlob: Blob;
  thumbnailBlob: Blob;
  width: number;
  height: number;
};

type StickerWorkerWarmupSuccess = {
  ok: true;
};

type StickerWorkerMessage =
  | {
      id: number;
      type: 'progress';
      progress: number;
      stage: string;
    }
  | {
      id: number;
      type: 'result';
      result: StickerWorkerSuccess | StickerWorkerWarmupSuccess;
    }
  | {
      id: number;
      type: 'partial';
      result: StickerWorkerPartial;
    }
  | {
      id: number;
      type: 'error';
      error: string;
    };

let worker: Worker | null = null;
let callbackId = 0;

const pendingJobs = new Map<
  number,
  {
    resolve: (value: StickerWorkerSuccess | StickerWorkerWarmupSuccess) => void;
    reject: (reason?: unknown) => void;
    onProgress?: StickerWorkerProgressHandler;
    onPartial?: StickerWorkerPartialHandler;
  }
>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../workers/sticker-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<StickerWorkerMessage>) => {
      const message = event.data;
      const job = pendingJobs.get(message.id);

      if (!job) {
        return;
      }

      if (message.type === 'progress') {
        job.onProgress?.(message.progress, message.stage);
        return;
      }

      if (message.type === 'partial') {
        job.onPartial?.(message.result);
        return;
      }

      if (message.type === 'result') {
        job.resolve(message.result);
      } else {
        job.reject(new Error(message.error));
      }

      pendingJobs.delete(message.id);
    };
  }

  return worker;
}

export function processStickerInWorker(
  file: Blob,
  options?: {
    maxDim?: number;
    thumbnailMaxDim?: number;
    onProgress?: StickerWorkerProgressHandler;
    onPartial?: StickerWorkerPartialHandler;
  }
) {
  return new Promise<StickerWorkerSuccess>((resolve, reject) => {
    const id = ++callbackId;

    pendingJobs.set(id, {
      resolve: (value) => resolve(value as StickerWorkerSuccess),
      reject,
      onProgress: options?.onProgress,
      onPartial: options?.onPartial,
    });

    getWorker().postMessage({
      id,
      action: 'processSticker',
      payload: {
        file,
        maxDim: options?.maxDim,
        thumbnailMaxDim: options?.thumbnailMaxDim,
      },
    });
  });
}

export function warmStickerEngine() {
  return new Promise<void>((resolve, reject) => {
    const id = ++callbackId;

    pendingJobs.set(id, {
      resolve: () => resolve(),
      reject,
    });

    getWorker().postMessage({
      id,
      action: 'warmupStickerEngine',
    });
  });
}
