/**
 * Resizes an image Blob so its longest dimension fits within maxDim.
 * Useful for shrinking multi-megapixel camera photos before AI processing to prevent lag.
 */
export async function resizeImage(blob: Blob, maxDim = 800): Promise<Blob> {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = url;
    });

    URL.revokeObjectURL(url);

    let { width, height } = img;

    // Only resize if the image actually exceeds maxDim
    if (width <= maxDim && height <= maxDim) {
        return blob;
    }

    if (width > height) {
        height = Math.floor(height * (maxDim / width));
        width = maxDim;
    } else {
        width = Math.floor(width * (maxDim / height));
        height = maxDim;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) return blob;

    // Better interpolation for downscaling 
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    return new Promise((resolve) => {
        // Use JPEG for flat photos, PNG for transparent stuff.
        // Assuming camera photos are JPEG/HEIC, we convert to high-quality JPEG to keep parsing fast
        const type = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const quality = type === 'image/jpeg' ? 0.9 : undefined;
        canvas.toBlob((b) => resolve(b || blob), type, quality);
    });
}

export async function autoCropTransparentImage(blob: Blob): Promise<Blob> {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;

    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
    let hasPixels = false;

    const ALPHA_THRESHOLD = 25;

    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            const alpha = data[(y * canvas.width + x) * 4 + 3];
            if (alpha > ALPHA_THRESHOLD) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                hasPixels = true;
            }
        }
    }

    URL.revokeObjectURL(url);

    if (!hasPixels) {
        return blob; // Empty image
    }

    // Add 2px padding to avoid strict clipping
    const padding = 2;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(canvas.width - 1, maxX + padding);
    maxY = Math.min(canvas.height - 1, maxY + padding);

    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;

    // If the crop is basically the whole image, skip
    if (cropWidth >= canvas.width - 4 && cropHeight >= canvas.height - 4) {
        return blob;
    }

    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = cropWidth;
    croppedCanvas.height = cropHeight;
    const croppedCtx = croppedCanvas.getContext('2d');
    if (!croppedCtx) return blob;

    croppedCtx.drawImage(
        canvas,
        minX, minY, cropWidth, cropHeight,
        0, 0, cropWidth, cropHeight
    );

    return new Promise<Blob>((resolve) => {
        croppedCanvas.toBlob((b) => resolve(b || blob), 'image/png');
    });
}
