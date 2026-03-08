import { useState, useRef, useCallback, useEffect } from 'react';
import { db } from '../../lib/db';
import type { PlacedSticker } from '../../lib/db';
import type { EditorView } from '@codemirror/view';
import { Trash2, RotateCw, Wand2, Loader, X } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   Sticker Overlay — freely positionable stickers with transform UI
   ═══════════════════════════════════════════════════════════════ */

interface StickerOverlayProps {
    noteId: string;
    placedStickers: PlacedSticker[];
    onUpdate: (stickers: PlacedSticker[]) => void;
    getLineBlock?: (lineNo: number) => { top: number, bottom: number } | null;
    viewRef?: React.MutableRefObject<EditorView | null>;
}

const BASE_SIZE = 80; // px — base sticker render size before scaling

const FILTERS = [
    '',
    'grayscale(100%)',
    'sepia(100%)',
    'hue-rotate(90deg)',
    'hue-rotate(180deg)',
    'hue-rotate(270deg)',
    'invert(100%)',
    'blur(2px)',
    'contrast(200%)',
    'saturate(300%)',
];

export default function StickerOverlay({ noteId, placedStickers, onUpdate, getLineBlock, viewRef }: StickerOverlayProps) {
    const [stickerData, setStickerData] = useState<Map<string, { url: string; w: number; h: number; error?: boolean }>>(new Map());
    const [selected, setSelected] = useState<number | null>(null);
    const overlayRef = useRef<HTMLDivElement>(null);

    // ─── Local State for Smooth Dragging ───
    // We manipulate this array while dragging, and only push to DB on drop.
    const [localStickers, setLocalStickers] = useState<PlacedSticker[]>(placedStickers);
    const isDragging = useRef(false);

    // Sync prop -> local state ONLY if we aren't actively dragging
    useEffect(() => {
        if (!isDragging.current) {
            const syncId = window.setTimeout(() => {
                setLocalStickers(placedStickers);
            }, 0);
            return () => window.clearTimeout(syncId);
        }
    }, [placedStickers]);

    // ─── Resolve sticker aspect ratios and thumbnails ───
    useEffect(() => {
        const ids = [...new Set(placedStickers.map((s) => s.stickerId))];
        const missing = ids.filter((id) => !stickerData.has(id));
        if (missing.length === 0) return;

        let isMounted = true;
        Promise.all(missing.map(async (id) => {
            const s = await db.stickers.get(id);
            return { id, s };
        })).then((results) => {
            if (!isMounted) return;
            setStickerData((prev) => {
                const next = new Map(prev);
                results.forEach(({ id, s }) => {
                    if (s) {
                        next.set(s.id, { url: s.thumbnailUrl, w: s.width, h: s.height });
                    } else {
                        // Mark as failed so we don't keep trying or stay in loading state
                        next.set(id, { url: '', w: 100, h: 100, error: true });
                    }
                });
                return next;
            });
        });
        return () => { isMounted = false; };
    }, [placedStickers, stickerData]);

    // Reset selection on note change
    useEffect(() => {
        const resetId = window.setTimeout(() => {
            setSelected(null);
        }, 0);
        return () => window.clearTimeout(resetId);
    }, [noteId]);

    // Deselect on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const t = e.target as HTMLElement;
            if (t.closest('.placed-sticker') || t.closest('.sticker-picker-wrap')) return;
            setSelected(null);
        };
        document.addEventListener('pointerdown', handler);
        return () => document.removeEventListener('pointerdown', handler);
    }, []);

    const dragRef = useRef<{
        mode: 'move' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br' | 'rotate';
        index: number;
        startX: number;
        startY: number;
        orig: PlacedSticker;
        centerX: number;
        centerY: number;
        baseW: number;
        baseH: number;
    } | null>(null);

    const onDragStart = useCallback(
        (e: React.PointerEvent, index: number, mode: 'move' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br' | 'rotate', baseW: number, baseH: number) => {
            e.preventDefault();
            e.stopPropagation();
            setSelected(index);
            const el = overlayRef.current;
            if (!el) return;

            const target = e.target as HTMLElement;
            target.setPointerCapture(e.pointerId);

            // Snapshot the sticker geometry
            setLocalStickers((currentLocal) => {
                const s = currentLocal[index];
                const rect = el.getBoundingClientRect();
                const imgW = baseW * s.scale;
                const imgH = baseH * s.scale;
                const cx = rect.left + (s.x / 100) * rect.width + imgW / 2;
                const cy = rect.top + (s.y / 100) * rect.height + imgH / 2;

                isDragging.current = true;
                dragRef.current = {
                    mode,
                    index,
                    startX: e.clientX,
                    startY: e.clientY,
                    orig: { ...s },
                    centerX: cx,
                    centerY: cy,
                    baseW,
                    baseH,
                };
                return currentLocal;
            });

            // Dynamic listeners attached to window guarantee we don't miss the 'up' event
            // and they don't fire spuriously on hover.
            const onPointerMove = (ev: PointerEvent) => {
                const d = dragRef.current;
                if (!d || !el) return;

                const rect = el.getBoundingClientRect();

                setLocalStickers((prev) => {
                    const updated = [...prev];
                    if (d.mode === 'move') {
                        const dx = ((ev.clientX - d.startX) / rect.width) * 100;
                        const dy = ((ev.clientY - d.startY) / rect.height) * 100;
                        updated[d.index] = {
                            ...updated[d.index],
                            x: Math.max(-5, Math.min(95, d.orig.x + dx)),
                            y: Math.max(-5, Math.min(95, d.orig.y + dy)),
                        };
                    } else if (d.mode.startsWith('resize-')) {
                        const isRight = d.mode.endsWith('tr') || d.mode.endsWith('br');
                        const isBottom = d.mode.endsWith('bl') || d.mode.endsWith('br');
                        const rx = isRight ? 1 : -1;
                        const ry = isBottom ? 1 : -1;

                        // Local unscaled handle vector from center
                        const hx = rx * (BASE_SIZE / 2);
                        const hy = ry * (BASE_SIZE / 2);

                        // Rotation math
                        const angleRad = (d.orig.rotation * Math.PI) / 180;
                        const cosA = Math.cos(angleRad);
                        const sinA = Math.sin(angleRad);

                        // Original handle vector from center (scaled and rotated)
                        const Hx_rot = (hx * cosA - hy * sinA) * d.orig.scale;
                        const Hy_rot = (hx * sinA + hy * cosA) * d.orig.scale;

                        // Absolute position of Anchor (opposite corner)
                        const anchorX = d.centerX - Hx_rot;
                        const anchorY = d.centerY - Hy_rot;

                        // Absolute position of Original Handle
                        const origHandleX = d.centerX + Hx_rot;
                        const origHandleY = d.centerY + Hy_rot;

                        // Vector from Anchor to Original Handle (V)
                        const vx = origHandleX - anchorX;
                        const vy = origHandleY - anchorY;

                        // Vector from Anchor to Current Mouse (U)
                        const ux = ev.clientX - anchorX;
                        const uy = ev.clientY - anchorY;

                        // Scalar projection factor m = dot(U, V) / dot(V, V)
                        const dotV = vx * vx + vy * vy;
                        let m = 1;
                        if (dotV !== 0) {
                            m = (ux * vx + uy * vy) / dotV;
                        }

                        let newScale = d.orig.scale * m;
                        newScale = Math.max(40 / BASE_SIZE, Math.min(609 / BASE_SIZE, newScale));

                        // Scale ratio against the ORIGINAL scale
                        const scaleRatio = newScale / d.orig.scale;

                        // The anchor remains fixed, new center moves relative to anchor
                        const newCenterX = anchorX + Hx_rot * scaleRatio;
                        const newCenterY = anchorY + Hy_rot * scaleRatio;

                        const newSzPx = BASE_SIZE * newScale;
                        const newImgWPct = (newSzPx / rect.width) * 100;
                        const newImgHPct = (newSzPx / rect.height) * 100;

                        updated[d.index] = {
                            ...updated[d.index],
                            scale: newScale,
                            x: ((newCenterX - rect.left) / rect.width) * 100 - newImgWPct / 2,
                            y: ((newCenterY - rect.top) / rect.height) * 100 - newImgHPct / 2
                        };
                    } else if (d.mode === 'rotate') {
                        const a0 = Math.atan2(d.startY - d.centerY, d.startX - d.centerX);
                        const a1 = Math.atan2(ev.clientY - d.centerY, ev.clientX - d.centerX);
                        const deg = ((a1 - a0) * 180) / Math.PI;
                        updated[d.index] = { ...updated[d.index], rotation: Math.round(d.orig.rotation + deg) };
                    }
                    return updated;
                });
            };

            const onPointerUp = (ev: PointerEvent) => {
                if (dragRef.current) {
                    dragRef.current = null;
                    isDragging.current = false;
                    // After drag completes, persist final state
                    setLocalStickers((finalStickers) => {
                        onUpdate(finalStickers);
                        return finalStickers;
                    });
                }

                try {
                    target.releasePointerCapture(ev.pointerId);
                } catch {
                    // Ignore if already released
                }
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
                window.removeEventListener('pointercancel', onPointerUp);
            };

            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
            window.addEventListener('pointercancel', onPointerUp);
        },
        [onUpdate]
    );

    const removeSticker = useCallback(
        (index: number) => {
            setLocalStickers((prev) => {
                const updated = prev.filter((_, i) => i !== index);
                onUpdate(updated);
                return updated;
            });
            setSelected(null);
        },
        [onUpdate]
    );

    const cycleFilter = useCallback(
        (index: number) => {
            setLocalStickers((prev) => {
                const updated = [...prev];
                const currentFilter = updated[index].filter || '';
                const currentIdx = FILTERS.indexOf(currentFilter);
                const nextIdx = currentIdx === -1 ? 1 : (currentIdx + 1) % FILTERS.length;
                updated[index] = { ...updated[index], filter: FILTERS[nextIdx] };
                onUpdate(updated);
                return updated;
            });
        },
        [onUpdate]
    );

    // We always render the container to allow for pointer events and absolute positioning context
    // if (localStickers.length === 0) return null;

    const magicArrange = useCallback(() => {
        if (localStickers.length === 0) return;

        setLocalStickers((prev) => {
            const updated = [...prev];
            const numLines = viewRef?.current?.state.doc.lines || 1;

            updated.forEach((s, i) => {
                // Distribute across lines (not all on line 1)
                const targetLine = Math.max(1, Math.min(numLines, Math.floor((i / updated.length) * numLines) + 1));

                // Alternate left and right margins
                const side = i % 2 === 0 ? 'left' : 'right';
                const x = side === 'left' ?
                    2 + Math.random() * 5 :  // 2-7% from left
                    85 + Math.random() * 5; // 85-90% from left (right side)

                updated[i] = {
                    ...s,
                    x,
                    anchorLine: targetLine,
                    anchorOffset: -10 + Math.random() * 20, // slight vertical jitter
                    scale: 0.8 + Math.random() * 0.4,
                    rotation: -12 + Math.random() * 24,
                };
            });

            onUpdate(updated);
            return updated;
        });
    }, [localStickers.length, onUpdate, viewRef]);

    return (
        <div
            ref={overlayRef}
            className="sticker-overlay"
        >
            <div className="overlay-magic-actions">
                <button
                    className="magic-btn"
                    onClick={magicArrange}
                    title="Magic Arrange"
                >
                    <Wand2 size={14} /> Magic Arrange
                </button>
            </div>

            {localStickers.map((placed, i) => {
                const sData = stickerData.get(placed.stickerId);
                const isSelected = selected === i;

                // Calculate vertical position
                let topPos = `${placed.y}%`;
                if (placed.anchorLine && getLineBlock) {
                    const block = getLineBlock(placed.anchorLine);
                    if (block) {
                        topPos = `${block.top + (placed.anchorOffset || 0)}px`;
                    }
                }

                if (!sData || sData.url === '') {
                    return (
                        <div
                            key={`sticker-loading-${i}`}
                            className="placed-sticker ps-loading"
                            style={{
                                left: `${placed.x}%`,
                                top: topPos,
                                width: 40,
                                height: 40,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'var(--color-surface-2)',
                                borderRadius: '4px',
                                border: '1px dashed var(--color-border)',
                                opacity: sData?.error ? 0.3 : 1
                            }}
                            onPointerDown={(e) => onDragStart(e, i, 'move', 40, 40)}
                        >
                            {sData?.error ? <X size={12} /> : <Loader size={12} className="spin" />}
                            {isSelected && (
                                <button
                                    className="action-btn ab-del ab-loading-del"
                                    onClick={(e) => { e.stopPropagation(); removeSticker(i); }}
                                    style={{ position: 'absolute', top: -10, right: -10 }}
                                >
                                    <Trash2 size={10} />
                                </button>
                            )}
                        </div>
                    );
                }

                // Real width and height
                const aspect = sData.w / sData.h;
                let baseW = BASE_SIZE;
                let baseH = BASE_SIZE;

                if (sData.w > sData.h) {
                    baseH = BASE_SIZE / aspect;
                } else {
                    baseW = BASE_SIZE * aspect;
                }

                const szW = baseW * placed.scale;
                const szH = baseH * placed.scale;

                return (
                    <div
                        key={`sticker-${i}`}
                        className={`placed-sticker ${isSelected ? 'ps-selected' : ''}`}
                        style={{
                            left: `${placed.x}%`,
                            top: topPos,
                            width: szW,
                            height: szH,
                            transform: `rotate(${placed.rotation}deg)`,
                            '--sticker-filter': placed.filter || 'drop-shadow(0 0 0 transparent)',
                        } as React.CSSProperties}
                        onPointerDown={(e) => onDragStart(e, i, 'move', baseW, baseH)}
                    >
                        <img src={sData.url} alt="sticker" draggable={false} />

                        {isSelected && (
                            <>
                                {/* Selection border — exactly wraps image */}
                                <div className="sf" />

                                {/* 4 corner handles */}
                                <div className="rh rh-tl" onPointerDown={(e) => onDragStart(e, i, 'resize-tl', baseW, baseH)} />
                                <div className="rh rh-tr" onPointerDown={(e) => onDragStart(e, i, 'resize-tr', baseW, baseH)} />
                                <div className="rh rh-bl" onPointerDown={(e) => onDragStart(e, i, 'resize-bl', baseW, baseH)} />
                                <div className="rh rh-br" onPointerDown={(e) => onDragStart(e, i, 'resize-br', baseW, baseH)} />

                                {/* Rotate stem + handle */}
                                <div className="rot-stem" />
                                <div className="rot-handle" onPointerDown={(e) => onDragStart(e, i, 'rotate', baseW, baseH)}>
                                    <RotateCw size={11} />
                                </div>

                                {/* Filter and Delete buttons container */}
                                <div className="actions-bar">
                                    <button className="action-btn ab-filter" onClick={(e) => { e.stopPropagation(); cycleFilter(i); }} title="Cycle Filter">
                                        <Wand2 size={11} />
                                    </button>
                                    <button className="action-btn ab-del" onClick={(e) => { e.stopPropagation(); removeSticker(i); }} title="Delete Sticker">
                                        <Trash2 size={11} />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                );
            })}

            <style>{overlayCSS}</style>
        </div>
    );
}

const overlayCSS = `
.sticker-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 20;
  overflow: visible;
}

.overlay-magic-actions {
  position: absolute;
  top: -48px;
  right: 0;
  display: flex;
  gap: 8px;
  pointer-events: auto;
}

.magic-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  color: var(--color-accent);
  font-size: var(--text-xs);
  font-family: var(--font-ui);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--dur-fast);
  box-shadow: var(--shadow-sm);
}

.magic-btn:hover {
  background: var(--color-accent-light);
  border-color: var(--color-accent);
  transform: translateY(-1px);
}

/* ─── Each placed sticker ─── */
.placed-sticker {
  position: absolute;
  pointer-events: auto;
  cursor: grab;
  user-select: none;
  touch-action: none;
  filter: drop-shadow(0 2px 6px rgba(0,0,0,0.18));
  transition: filter 150ms ease;
  transform-origin: center center;
  will-change: transform, left, top;
}
.placed-sticker:active { cursor: grabbing; }
.placed-sticker.ps-selected { z-index: 20; }
.placed-sticker:hover {
  filter: drop-shadow(0 4px 14px rgba(0,0,0,0.3));
}

.placed-sticker img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  filter: var(--sticker-filter, none);
}

/* ─── Selection Frame ─── */
.sf {
  position: absolute;
  inset: -4px;
  border: 2px dashed var(--color-accent);
  border-radius: 4px;
  pointer-events: none;
  animation: sfPulse 2s ease-in-out infinite;
}
@keyframes sfPulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

/* ─── Resize Handles (corners) ─── */
.rh {
  position: absolute;
  width: 10px;
  height: 10px;
  background: white;
  border: 2px solid var(--color-accent);
  border-radius: 2px;
  pointer-events: auto;
  z-index: 25;
  box-shadow: 0 1px 3px rgba(0,0,0,0.25);
  transition: transform 80ms ease;
}
.rh:hover { transform: scale(1.3); background: var(--color-accent); }

.rh-tl { top: -7px; left: -7px; cursor: nwse-resize; }
.rh-tr { top: -7px; right: -7px; cursor: nesw-resize; }
.rh-bl { bottom: -7px; left: -7px; cursor: nesw-resize; }
.rh-br { bottom: -7px; right: -7px; cursor: nwse-resize; }

/* ─── Rotate ─── */
.rot-stem {
  position: absolute;
  top: -20px;
  left: 50%;
  transform: translateX(-50%);
  width: 1.5px;
  height: 16px;
  background: var(--color-accent);
  opacity: 0.5;
  pointer-events: none;
}
.rot-handle {
  position: absolute;
  top: -38px;
  left: 50%;
  transform: translateX(-50%);
  width: 22px;
  height: 22px;
  background: white;
  border: 2px solid var(--color-accent);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-accent);
  cursor: grab;
  pointer-events: auto;
  z-index: 25;
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
  transition: background-color 80ms ease, color 80ms ease, transform 80ms ease, border-color 80ms ease;
}
.rot-handle:hover { background: var(--color-accent); color: white; transform: translateX(-50%) scale(1.15); }
.rot-handle:active { cursor: grabbing; }

/* ─── Actions Bar (Top Right) ─── */
.actions-bar {
  position: absolute;
  top: -12px;
  right: -30px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 25;
}

.action-btn {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  color: white;
  border: 2px solid white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  pointer-events: auto;
  padding: 0;
  box-shadow: 0 1px 4px rgba(0,0,0,0.25);
  transition: transform 80ms ease;
}
.action-btn:hover { transform: scale(1.2); }

.ab-filter {
  background: var(--color-accent);
}
.ab-filter:hover {
  background: var(--color-accent-hover, #0056b3);
}

.ab-del {
  background: hsl(0 65% 52%);
}
.ab-del:hover {
  background: hsl(0 70% 45%);
}
`;
