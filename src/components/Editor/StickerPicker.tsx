import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../../lib/db';
import type { Sticker, PlacedSticker } from '../../lib/db';
import { Sticker as StickerIcon, X } from 'lucide-react';

interface StickerPickerProps {
  onPlace: (placed: PlacedSticker) => void;
  keywords?: string[];
}

export default function StickerPicker({ onPlace, keywords = [] }: StickerPickerProps) {
  const [open, setOpen] = useState(false);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [search, setSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerDragRef = useRef<{ x: number, y: number, time: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    db.stickers.orderBy('createdAt').reverse().toArray().then(setStickers);
  }, [open]);

  // Derived collections
  const filteredStickers = stickers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const suggestedStickers = filteredStickers.filter(s =>
    keywords.some(k => s.name.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(s.name.toLowerCase()))
  );

  const otherStickers = filteredStickers.filter(s => !suggestedStickers.includes(s));

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const insertSticker = useCallback(
    (sticker: Sticker) => {
      // Calculate position at the center of the currently visible viewport
      const scrollEl = document.querySelector('.editor-scroll') as HTMLElement | null;
      const contentEl = document.querySelector('.editor-content') as HTMLElement | null;

      const xPct = 35 + Math.random() * 30;  // centered 35–65% horizontally
      let yPct = 30 + Math.random() * 20;  // fallback 30–50%

      if (scrollEl && contentEl) {
        const contentH = contentEl.scrollHeight;
        const viewportH = scrollEl.clientHeight;
        const scrollTop = scrollEl.scrollTop;

        // Center of visible viewport in content-relative percentage
        const viewCenterY = scrollTop + viewportH / 2;
        const centerPct = (viewCenterY / contentH) * 100;

        // Scatter slightly around viewport center (±8%)
        yPct = centerPct - 8 + Math.random() * 16;
        yPct = Math.max(2, Math.min(90, yPct));
      }

      const placed: PlacedSticker = {
        stickerId: sticker.id,
        x: xPct,
        y: yPct,
        scale: 0.9 + Math.random() * 0.3,
        rotation: -8 + Math.random() * 16,
      };
      onPlace(placed);
      setOpen(false);
    },
    [onPlace]
  );

  return (
    <div className="sticker-picker-wrap" ref={pickerRef}>
      <button
        className={`editor-header-btn sticker-picker-btn ${open ? 'active' : ''}`}
        onClick={() => setOpen(!open)}
        title="Place Sticker"
      >
        <StickerIcon size={15} />
      </button>

      {open && (
        <div className="sticker-picker-popover">
          <div className="picker-header">
            <span className="picker-title">Magic Stickers</span>
            <button className="picker-close" onClick={() => setOpen(false)}>
              <X size={14} />
            </button>
          </div>

          <div className="picker-search">
            <input
              type="text"
              placeholder="Search stickers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          <div className="picker-content">
            {filteredStickers.length === 0 ? (
              <div className="picker-empty">
                <p>No stickers found</p>
                <span>Try a different search or create more in the Stickers panel</span>
              </div>
            ) : (
              <div className="picker-sections">
                {suggestedStickers.length > 0 && (
                  <div className="picker-section">
                    <div className="section-label">Suggested for you</div>
                    <div className="picker-grid">
                      {suggestedStickers.map((s) => (
                        <StickerItem key={s.id} sticker={s} onSelect={insertSticker} setOpen={setOpen} pickerDragRef={pickerDragRef} />
                      ))}
                    </div>
                  </div>
                )}

                <div className="picker-section">
                  <div className="section-label">{suggestedStickers.length > 0 ? 'Your Collection' : 'All Stickers'}</div>
                  <div className="picker-grid">
                    {otherStickers.map((s) => (
                      <StickerItem key={s.id} sticker={s} onSelect={insertSticker} setOpen={setOpen} pickerDragRef={pickerDragRef} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{styles}</style>
    </div>
  );
}

function StickerItem({ sticker, onSelect, setOpen, pickerDragRef }: {
  sticker: Sticker,
  onSelect: (s: Sticker) => void,
  setOpen: (o: boolean) => void,
  pickerDragRef: React.MutableRefObject<{ x: number, y: number, time: number } | null>
}) {
  return (
    <div
      className="picker-sticker"
      title={sticker.name}
      draggable
      onPointerDown={(e) => {
        pickerDragRef.current = {
          x: e.clientX,
          y: e.clientY,
          time: Date.now()
        };
      }}
      onPointerUp={(e) => {
        const start = pickerDragRef.current;
        if (!start) return;
        const dx = Math.abs(e.clientX - start.x);
        const dy = Math.abs(e.clientY - start.y);
        const dt = Date.now() - start.time;
        if (dx < 10 && dy < 10 && dt < 600) {
          onSelect(sticker);
        }
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData('stickerid', sticker.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onDragEnd={() => setOpen(false)}
      style={{ cursor: 'pointer' }}
    >
      <img
        src={sticker.thumbnailUrl}
        alt={sticker.name}
        style={{ pointerEvents: 'none' }}
      />
    </div>
  );
}

const styles = `
  .sticker-picker-wrap {
    position: relative;
  }
  .sticker-picker-btn.active {
    background: var(--color-accent-light);
    color: var(--color-accent);
  }
  .sticker-picker-popover {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 260px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    z-index: 1000;
    overflow: hidden;
    animation: pickerSlide 150ms ease;
  }
  @keyframes pickerSlide {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--color-border);
  }
  .picker-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-1);
  }
  .picker-close {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--color-text-3);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .picker-close:hover {
    background: var(--color-surface-2);
    color: var(--color-text-1);
  }
  .picker-empty {
    padding: 24px 16px;
    text-align: center;
    color: var(--color-text-3);
  }
  .picker-empty p {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-2);
    margin-bottom: 4px;
  }
  .picker-empty span {
    font-size: var(--text-xs);
  }
  .picker-search {
    padding: 8px 10px;
    background: var(--color-surface-2);
    border-bottom: 1px solid var(--color-border);
  }
  .picker-search input {
    width: 100%;
    padding: 6px 10px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-1);
    font-size: var(--text-xs);
    outline: none;
    transition: border-color 0.2s;
  }
  .picker-search input:focus {
    border-color: var(--color-accent);
  }
  .picker-content {
    max-height: 350px;
    overflow-y: auto;
  }
  .picker-section {
    padding-bottom: 8px;
  }
  .section-label {
    padding: 8px 12px 4px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 700;
    color: var(--color-text-4);
  }
  .picker-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    padding: 6px 10px;
  }
  .picker-sticker {
    aspect-ratio: 1;
    border: 1.5px solid transparent;
    border-radius: var(--radius-md);
    background: var(--color-surface-2);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    transition: background-color 100ms ease, border-color 100ms ease, transform 100ms ease;
    overflow: hidden;
  }
  .picker-sticker:hover {
    border-color: var(--color-accent);
    background: var(--color-accent-light);
    transform: scale(1.08);
  }
  .picker-sticker img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    pointer-events: none;
  }
`;
