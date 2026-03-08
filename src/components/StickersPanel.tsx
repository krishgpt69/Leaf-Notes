import { useState, useRef, useCallback, useEffect } from 'react';
import { removeBackground } from '@imgly/background-removal';
import { db, type Sticker } from '../lib/db';
import { autoCropTransparentImage, resizeImage } from '../lib/imageUtils';
import { v4 as uuid } from 'uuid';
import {
  Scissors,
  Trash2,
  Download,
  Copy,
  Sparkles,
  X,
  Loader,
} from 'lucide-react';

type ProcessingState = 'idle' | 'processing' | 'done' | 'error';

export default function StickersPanel() {
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);

  // Source state
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Final result state
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [selectedSticker, setSelectedSticker] = useState<Sticker | null>(null);
  const [latestCreatedSticker, setLatestCreatedSticker] = useState<Sticker | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [resultFailed, setResultFailed] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Load stickers from DB
  useEffect(() => {
    const load = async () => {
      const all = await db.stickers.orderBy('createdAt').reverse().toArray();
      setStickers(all);
    };
    load();
  }, []);

  // Removed blobToDataUrl because creating base64 strings from 15MB photos blocks the UI thread

  const getImageDimensions = useCallback(
    (url: string): Promise<{ width: number; height: number }> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.src = url;
      });
    },
    []
  );

  // Step 2: Auto Crop and process entirely
  const processCrop = useCallback(async (initialDataUrl?: string, initialFile?: File) => {
    const url = initialDataUrl || previewUrl;
    const file = initialFile || originalFile;
    if (!url || !file) return;

    setProcessingState('processing');
    setProgress(0);
    setResultUrl(null);
    setResultFailed(false);

    try {
      const img = new Image();
      img.src = url;
      await new Promise<void>((r) => { img.onload = () => r(); });

      const progressInterval = setInterval(() => {
        setProgress((p) => Math.min(p + 2, 90));
      }, 200);

      // Pre-shrink the image (max 800px) so the AI doesn't choke on 12MP photos
      const processingBlob = await resizeImage(file, 800);

      // Run AI background removal on the fast, resized blob
      const rawAiBlob = await removeBackground(processingBlob, {
        progress: (_key: string, current: number, total: number) => {
          if (total > 0) {
            setProgress(Math.round((current / total) * 100));
          }
        },
      });

      clearInterval(progressInterval);
      setProgress(100);

      let finalResultBlob = rawAiBlob;

      // Auto crop the transparent whitespace!
      finalResultBlob = await autoCropTransparentImage(finalResultBlob);

      const resultDataUrl = URL.createObjectURL(finalResultBlob);
      setResultUrl(resultDataUrl);
      setResultFailed(false);

      const dims = await getImageDimensions(resultDataUrl);

      // Create thumbnail
      const thumbCanvas = document.createElement('canvas');
      const maxThumb = 200;
      const scale = Math.min(maxThumb / dims.width, maxThumb / dims.height, 1);
      thumbCanvas.width = dims.width * scale;
      thumbCanvas.height = dims.height * scale;
      const tctx = thumbCanvas.getContext('2d')!;
      const thumbImg = new Image();
      thumbImg.src = resultDataUrl;
      await new Promise<void>((r) => { thumbImg.onload = () => r(); });
      tctx.drawImage(thumbImg, 0, 0, thumbCanvas.width, thumbCanvas.height);
      const thumbUrl = thumbCanvas.toDataURL('image/png');

      // Save to DB
      const sticker: Sticker = {
        id: uuid(),
        name: file.name.replace(/\.[^.]+$/, ''),
        originalBlob: file,
        stickerBlob: finalResultBlob,
        thumbnailUrl: thumbUrl,
        width: dims.width,
        height: dims.height,
        createdAt: Date.now(),
      };
      await db.stickers.put(sticker);
      setStickers((prev) => [sticker, ...prev]);
      setLatestCreatedSticker(sticker);
      setProcessingState('done');
    } catch (err) {
      console.error('Background removal failed:', err);
      setProcessingState('error');
    }
  }, [previewUrl, originalFile, getImageDimensions]);

  // Step 1: User uploads → show the selection UI
  const handleUpload = useCallback(
    async (file: File) => {
      const objectUrl = URL.createObjectURL(file);
      setOriginalFile(file);
      setPreviewUrl(objectUrl);
      setPreviewFailed(false);
      setResultUrl(null);
      setResultFailed(false);

      // Instantly start processing the full file
      setProcessingState('processing');
      processCrop(objectUrl, file);
    },
    [processCrop]
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const file = Array.from(files).find((f) => f.type.startsWith('image/'));
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );


  const deleteSticker = useCallback(async (id: string) => {
    await db.stickers.delete(id);
    setStickers((prev) => prev.filter((s) => s.id !== id));
    setSelectedSticker(null);
  }, []);

  const downloadSticker = useCallback(async (sticker: Sticker) => {
    const pngBlob =
      sticker.stickerBlob.type === 'image/png'
        ? sticker.stickerBlob
        : new Blob([sticker.stickerBlob], { type: 'image/png' });
    const url = URL.createObjectURL(pngBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sticker.name}-sticker.png`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Delay revoke so browsers have time to start download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const copySticker = useCallback(
    async (sticker: Sticker) => {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': sticker.stickerBlob,
            'text/plain': new Blob([`leaf-sticker:${sticker.id}`], { type: 'text/plain' })
          }),
        ]);
      } catch {
        downloadSticker(sticker);
      }
    },
    [downloadSticker]
  );

  const resetProcessor = useCallback(() => {
    setProcessingState('idle');
    setPreviewUrl(null);
    setOriginalFile(null);
    setResultUrl(null);
    setLatestCreatedSticker(null);
    setProgress(0);
  }, []);

  return (
    <div className="stickers-panel">
      <div className="stickers-header">
        <h2 className="stickers-title">
          <Sparkles size={16} /> Stickers
        </h2>
        <span className="stickers-count">{stickers.length} stickers</span>
      </div>

      <div className="stickers-body">
        <div className="sticker-processor">
          {/* ─── Idle: Upload ─── */}
          {processingState === 'idle' && (
            <div
              className={`sticker-dropzone hover-lift ${dragOver ? 'drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files) handleFiles(e.target.files);
                  // Allow selecting the same file again.
                  e.currentTarget.value = '';
                }}
              />
              <div className="dropzone-icon">
                <Scissors size={28} />
              </div>
              <h3>Create a Sticker</h3>
              <p>Drop a photo or click to upload — select the area and AI removes the background</p>
            </div>
          )}


          {/* ─── Processing: Progress ─── */}
          {processingState === 'processing' && (
            <div className="sticker-workspace">
              <div className="sticker-preview-area">
                <div className="preview-card">
                  <span className="preview-label">Selected Area</span>
                  <div className="preview-img-wrap">
                    {previewUrl && !previewFailed ? (
                      <img src={previewUrl} alt="Original" onError={() => setPreviewFailed(true)} />
                    ) : (
                      <div className="preview-placeholder">
                        <Scissors size={24} />
                      </div>
                    )}
                  </div>
                </div>
                <div className="preview-arrow">
                  <Loader size={20} className="spin" />
                </div>
                <div className="preview-card result">
                  <span className="preview-label">Sticker</span>
                  <div className="preview-img-wrap checkerboard">
                    <div className="preview-placeholder">
                      <Scissors size={24} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="sticker-progress">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <span className="progress-text">
                  {progress < 30
                    ? 'Loading AI model...'
                    : progress < 90
                      ? 'Removing background...'
                      : 'Finishing up...'}
                </span>
              </div>
            </div>
          )}

          {/* ─── Done: Result ─── */}
          {processingState === 'done' && (
            <div className="sticker-workspace">
              <button className="workspace-close" onClick={resetProcessor}>
                <X size={16} />
              </button>
              <div className="sticker-preview-area">
                <div className="preview-card">
                  <span className="preview-label">Original</span>
                  <div className="preview-img-wrap">
                    {previewUrl && !previewFailed ? (
                      <img src={previewUrl} alt="Original" onError={() => setPreviewFailed(true)} />
                    ) : (
                      <div className="preview-placeholder">
                        <Scissors size={24} />
                      </div>
                    )}
                  </div>
                </div>
                <div className="preview-arrow">
                  <Sparkles size={20} />
                </div>
                <div className="preview-card result">
                  <span className="preview-label">Sticker</span>
                  <div className="preview-img-wrap checkerboard">
                    {(resultUrl || latestCreatedSticker?.thumbnailUrl) && !resultFailed ? (
                      <img src={resultUrl || latestCreatedSticker?.thumbnailUrl} alt="Sticker" onError={() => setResultFailed(true)} />
                    ) : (
                      <div className="preview-placeholder">
                        <Sparkles size={24} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="sticker-done-actions">
                <button className="done-btn primary" onClick={resetProcessor}>
                  <Sparkles size={14} /> Create Another
                </button>
                <button
                  className="done-btn"
                  onClick={() => (latestCreatedSticker || stickers[0]) && copySticker(latestCreatedSticker || stickers[0])}
                >
                  <Copy size={14} /> Copy
                </button>
                <button
                  className="done-btn"
                  onClick={() => (latestCreatedSticker || stickers[0]) && downloadSticker(latestCreatedSticker || stickers[0])}
                >
                  <Download size={14} /> Save PNG
                </button>
              </div>
            </div>
          )}

          {/* ─── Error ─── */}
          {processingState === 'error' && (
            <div className="sticker-workspace">
              <div className="sticker-error">
                <p>Something went wrong. Try a different image.</p>
                <button className="done-btn primary" onClick={resetProcessor}>
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ─── Sticker Collection ─── */}
        {stickers.length > 0 && (
          <div className="sticker-collection">
            <h4 className="collection-title">Your Stickers</h4>
            <div className="sticker-grid">
              {stickers.map((sticker) => (
                <div
                  key={sticker.id}
                  className={`sticker-card ${selectedSticker?.id === sticker.id ? 'selected' : ''}`}
                  onClick={() =>
                    setSelectedSticker(selectedSticker?.id === sticker.id ? null : sticker)
                  }
                >
                  <div className="sticker-thumb checkerboard">
                    <img
                      src={sticker.thumbnailUrl}
                      alt={sticker.name}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('stickerId', sticker.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                    />
                  </div>
                  {selectedSticker?.id === sticker.id && (
                    <div className="sticker-card-actions">
                      <button title="Copy" onClick={(e) => { e.stopPropagation(); copySticker(sticker); }}>
                        <Copy size={13} />
                      </button>
                      <button title="Download" onClick={(e) => { e.stopPropagation(); downloadSticker(sticker); }}>
                        <Download size={13} />
                      </button>
                      <button title="Delete" className="danger" onClick={(e) => { e.stopPropagation(); deleteSticker(sticker.id); }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .stickers-panel {
    flex: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-lg);
    min-width: 0;
    overflow: hidden;
    position: relative;
    z-index: 1000;
  }
  .stickers-header {
    height: 40px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 24px;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }
  .stickers-title {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    color: var(--color-text-1);
    font-weight: 400;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .stickers-title svg { color: var(--color-accent); }
  .stickers-count {
    font-size: var(--text-xs);
    color: var(--color-text-3);
  }
  .stickers-body {
    flex: 1;
    overflow-y: auto;
    padding: 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 32px;
  }
  .sticker-processor {
    width: 100%;
    max-width: 560px;
  }

  /* ─── Drop zone ─── */
  .sticker-dropzone {
    border: 2px dashed var(--color-border-strong);
    border-radius: var(--radius-xl);
    padding: 48px 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    text-align: center;
    cursor: pointer;
    color: var(--color-text-3);
    transition: border-color var(--dur-fast) var(--spring-snappy),
      background-color var(--dur-fast) var(--spring-snappy),
      color var(--dur-fast) var(--spring-snappy),
      transform var(--dur-fast) var(--spring-snappy);
    background: var(--color-surface);
  }
  .sticker-dropzone:hover {
    border-color: var(--color-accent);
    background: var(--color-accent-light);
    color: var(--color-accent);
  }
  .sticker-dropzone.drag-over {
    border-color: var(--color-accent);
    background: var(--color-accent-light);
    color: var(--color-accent);
    transform: scale(1.01);
  }
  .dropzone-icon {
    width: 56px;
    height: 56px;
    border-radius: var(--radius-full);
    background: var(--color-accent-light);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-accent);
    margin-bottom: 4px;
  }
  .sticker-dropzone h3 {
    font-size: var(--text-md);
    font-weight: 600;
    color: var(--color-text-1);
  }
  .sticker-dropzone p {
    font-size: var(--text-sm);
    max-width: 300px;
    line-height: 1.5;
  }

  /* ─── Workspace ─── */
  .sticker-workspace {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    background: var(--color-surface);
    padding: 24px;
    position: relative;
  }
  .workspace-close {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 28px;
    height: 28px;
    border: none;
    background: var(--color-surface-2);
    border-radius: var(--radius-full);
    color: var(--color-text-3);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 5;
  }
  .workspace-close:hover {
    background: var(--color-surface-3);
    color: var(--color-text-1);
  }

  /* ─── Selection / Crop ─── */
  .selection-instructions {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-sm);
    color: var(--color-accent);
    font-weight: 500;
    margin-bottom: 16px;
    padding-right: 36px;
  }
  .crop-container {
    position: relative;
    width: 100%;
    margin: 24px 0;
    max-height: 400px;
    background: repeating-conic-gradient(var(--color-surface-hover) 0% 25%, transparent 0% 50%) 50% / 20px 20px;
    border-radius: var(--radius-md);
    overflow: hidden;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
  }
  .crop-image {
    display: block;
    max-width: 100%;
    max-height: 400px;
    margin: 0 auto;
    object-fit: contain;
    pointer-events: none;
  }
  .lasso-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    cursor: crosshair;
    touch-action: none;
    z-index: 10;
  }
  
  .crop-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    display: flex;
    flex-direction: column;
  }
  .crop-dim {
    background: rgba(0, 0, 0, 0.6);
    pointer-events: auto;
  }
  .crop-top, .crop-bottom {
    width: 100%;
  }
  .crop-bottom {
    flex: 1;
  }
  .crop-middle {
    display: flex;
    width: 100%;
  }
  .crop-right {
    flex: 1;
  }
  .crop-selection {
    position: relative;
    box-shadow: 0 0 0 2px var(--color-accent);
    cursor: move;
    pointer-events: auto;
    background: transparent;
  }
  /* Grid lines inside crop */
  .crop-selection::before, .crop-selection::after {
    content: '';
    position: absolute;
    background: rgba(255, 255, 255, 0.3);
  }
  .crop-selection::before {
    inset: 33.33% 0;
    border-top: 1px solid rgba(255, 255, 255, 0.4);
    border-bottom: 1px solid rgba(255, 255, 255, 0.4);
    background: transparent;
  }
  .crop-selection::after {
    inset: 0 33.33%;
    border-left: 1px solid rgba(255, 255, 255, 0.4);
    border-right: 1px solid rgba(255, 255, 255, 0.4);
    background: transparent;
  }
  .crop-handle {
    position: absolute;
    width: 24px;
    height: 24px;
    background: transparent;
  }
  .crop-handle::after {
    content: '';
    position: absolute;
    width: 10px;
    height: 10px;
    background: var(--color-accent);
    border: 2px solid white;
    border-radius: 50%;
  }
  .crop-handle-tl {
    top: -12px; left: -12px;
    cursor: nwse-resize;
  }
  .crop-handle-tl::after { top: 7px; left: 7px; }

  .crop-handle-tr {
    top: -12px; right: -12px;
    cursor: nesw-resize;
  }
  .crop-handle-tr::after { top: 7px; right: 7px; }

  .crop-handle-bl {
    bottom: -12px; left: -12px;
    cursor: nesw-resize;
  }
  .crop-handle-bl::after { bottom: 7px; left: 7px; }

  .crop-handle-br {
    bottom: -12px; right: -12px;
    cursor: nwse-resize;
  }
  .crop-handle-br::after { bottom: 7px; right: 7px; }

  .crop-size-label {
    position: absolute;
    bottom: 8px;
    left: 8px;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-family: var(--font-mono);
    pointer-events: none;
    backdrop-filter: blur(var(--glass-blur));
  }

  .selection-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 16px;
  }

  /* ─── Preview area ─── */
  .sticker-preview-area {
    display: flex;
    align-items: center;
    gap: 16px;
    justify-content: center;
  }
  .preview-card {
    flex: 1;
    max-width: 200px;
  }
  .preview-label {
    display: block;
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-3);
    margin-bottom: 8px;
    text-align: center;
  }
  .preview-img-wrap {
    aspect-ratio: 1;
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface-2);
  }
  .preview-img-wrap img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .preview-img-wrap.checkerboard {
    background-image:
      linear-gradient(45deg, var(--color-surface-2) 25%, transparent 25%),
      linear-gradient(-45deg, var(--color-surface-2) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--color-surface-2) 75%),
      linear-gradient(-45deg, transparent 75%, var(--color-surface-2) 75%);
    background-size: 16px 16px;
    background-position: 0 0, 0 8px, 8px -8px, -8px 0;
    background-color: var(--color-surface);
  }
  .preview-placeholder {
    color: var(--color-text-4);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }
  .preview-arrow {
    color: var(--color-accent);
    flex-shrink: 0;
  }
  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ─── Progress ─── */
  .sticker-progress {
    margin-top: 20px;
    text-align: center;
  }
  .progress-bar {
    height: 4px;
    background: var(--color-surface-2);
    border-radius: var(--radius-full);
    overflow: hidden;
    margin-bottom: 8px;
  }
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--color-accent), var(--color-teal));
    border-radius: var(--radius-full);
    transition: width 300ms var(--spring-smooth);
  }
  .progress-text {
    font-size: var(--text-xs);
    color: var(--color-text-3);
  }

  /* ─── Done actions ─── */
  .sticker-done-actions {
    display: flex;
    gap: 8px;
    justify-content: center;
    margin-top: 20px;
  }
  .done-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text-2);
    font-size: var(--text-sm);
    font-family: var(--font-ui);
    cursor: pointer;
    transition: background-color var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast), transform var(--dur-fast), box-shadow var(--dur-fast);
  }
  .done-btn:hover {
    background: var(--color-surface-2);
    border-color: var(--color-border-strong);
  }
  .done-btn.primary {
    background: var(--color-accent);
    color: white;
    border-color: var(--color-accent);
  }
  .done-btn.primary:hover {
    background: var(--color-accent-hover);
  }

  /* ─── Error ─── */
  .sticker-error {
    text-align: center;
    padding: 24px;
    color: var(--color-red);
    font-size: var(--text-sm);
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
  }

  /* ─── Collection ─── */
  .sticker-collection {
    width: 100%;
    max-width: 560px;
  }
  .collection-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-2);
    margin-bottom: 14px;
  }
  .sticker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 12px;
  }
  .sticker-card {
    position: relative;
    border-radius: var(--radius-lg);
    border: 2px solid transparent;
    cursor: pointer;
    transition: border-color var(--dur-fast) var(--spring-snappy),
      transform var(--dur-fast) var(--spring-snappy),
      box-shadow var(--dur-fast) var(--spring-snappy);
    overflow: hidden;
  }
  .sticker-card:hover {
    border-color: var(--color-border-strong);
    transform: scale(1.03);
  }
  .sticker-card.selected {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-light);
  }
  .sticker-thumb {
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    border-radius: var(--radius-md);
  }
  .sticker-thumb.checkerboard {
    background-image:
      linear-gradient(45deg, var(--color-surface-2) 25%, transparent 25%),
      linear-gradient(-45deg, var(--color-surface-2) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--color-surface-2) 75%),
      linear-gradient(-45deg, transparent 75%, var(--color-surface-2) 75%);
    background-size: 12px 12px;
    background-position: 0 0, 0 6px, 6px -6px, -6px 0;
    background-color: var(--color-surface);
  }
  .sticker-thumb img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
  }
  .sticker-card-actions {
    position: absolute;
    bottom: 4px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 2px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 3px;
    box-shadow: var(--shadow-md);
  }
  .sticker-card-actions button {
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--color-text-3);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .sticker-card-actions button:hover {
    background: var(--color-surface-2);
    color: var(--color-text-1);
  }
  .sticker-card-actions button.danger:hover {
    background: var(--color-red-light);
    color: var(--color-red);
  }
`;
