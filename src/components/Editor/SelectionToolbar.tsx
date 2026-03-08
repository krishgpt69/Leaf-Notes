import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    Bold,
    Italic,
    Highlighter,
    Palette,
    Type,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   Selection Toolbar — Floating formatting toolbar for preview mode
   ═══════════════════════════════════════════════════════════════ */

interface SelectionToolbarProps {
    content: string;
    onChange: (newContent: string) => void;
    containerSelector?: string;
}

const TEXT_COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff',
];

const HIGHLIGHT_COLORS = [
    '#fef08a', '#bbf7d0', '#bfdbfe', '#e9d5ff',
    '#fecdd3', '#fed7aa', '#99f6e4', '#e2e8f0',
];

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32];

export default function SelectionToolbar({ content, onChange, containerSelector = '.document-renderer' }: SelectionToolbarProps) {
    const [visible, setVisible] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const [selectedText, setSelectedText] = useState('');
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showHighlightPicker, setShowHighlightPicker] = useState(false);
    const [showSizePicker, setShowSizePicker] = useState(false);
    const toolbarRef = useRef<HTMLDivElement>(null);
    const selectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const closeAllPopups = useCallback(() => {
        setShowColorPicker(false);
        setShowHighlightPicker(false);
        setShowSizePicker(false);
    }, []);

    // Detect text selection within the document renderer
    useEffect(() => {
        const handleSelectionChange = () => {
            if (selectionTimeoutRef.current) {
                clearTimeout(selectionTimeoutRef.current);
            }

            selectionTimeoutRef.current = setTimeout(() => {
                const selection = window.getSelection();
                if (!selection || selection.isCollapsed || !selection.toString().trim()) {
                    setVisible(false);
                    closeAllPopups();
                    return;
                }

                // Only show toolbar if selection is within the document renderer
                const container = document.querySelector(containerSelector);
                if (!container) return;

                const anchorNode = selection.anchorNode;
                const focusNode = selection.focusNode;
                if (!anchorNode || !focusNode) return;
                if (!container.contains(anchorNode) || !container.contains(focusNode)) {
                    setVisible(false);
                    closeAllPopups();
                    return;
                }

                const text = selection.toString().trim();
                if (!text) return;

                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();

                // Position toolbar above selection, centered horizontally
                const toolbarWidth = 280;
                let left = rect.left + rect.width / 2 - toolbarWidth / 2;
                left = Math.max(8, Math.min(left, window.innerWidth - toolbarWidth - 8));

                setPosition({
                    top: rect.top + window.scrollY - 52,
                    left,
                });
                setSelectedText(text);
                setVisible(true);
            }, 200);
        };

        document.addEventListener('selectionchange', handleSelectionChange);
        return () => {
            document.removeEventListener('selectionchange', handleSelectionChange);
            if (selectionTimeoutRef.current) {
                clearTimeout(selectionTimeoutRef.current);
            }
        };
    }, [containerSelector, closeAllPopups]);

    // Close toolbar on click outside
    useEffect(() => {
        if (!visible) return;
        const handler = (e: MouseEvent) => {
            if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
                closeAllPopups();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [visible, closeAllPopups]);

    // Apply formatting by wrapping selected text in the raw content
    const applyFormat = useCallback((wrapper: (text: string) => string) => {
        if (!selectedText) return;

        // Find the selected text in the raw content and wrap it
        const idx = content.indexOf(selectedText);
        if (idx === -1) return;

        const before = content.slice(0, idx);
        const after = content.slice(idx + selectedText.length);
        const newContent = before + wrapper(selectedText) + after;
        onChange(newContent);

        // Clear selection after applying
        window.getSelection()?.removeAllRanges();
        setVisible(false);
        closeAllPopups();
    }, [content, selectedText, onChange, closeAllPopups]);

    const handleBold = useCallback(() => {
        applyFormat(text => `**${text}**`);
    }, [applyFormat]);

    const handleItalic = useCallback(() => {
        applyFormat(text => `*${text}*`);
    }, [applyFormat]);

    const handleHighlight = useCallback((color: string) => {
        applyFormat(text => `<mark style="background:${color}">${text}</mark>`);
        setShowHighlightPicker(false);
    }, [applyFormat]);

    const handleColor = useCallback((color: string) => {
        applyFormat(text => `<span style="color:${color}">${text}</span>`);
        setShowColorPicker(false);
    }, [applyFormat]);

    const handleFontSize = useCallback((size: number) => {
        applyFormat(text => `<span style="font-size:${size}px">${text}</span>`);
        setShowSizePicker(false);
    }, [applyFormat]);

    if (!visible) return null;

    return createPortal(
        <div
            ref={toolbarRef}
            className="sel-toolbar"
            style={{
                position: 'absolute',
                top: position.top,
                left: position.left,
            }}
        >
            {/* Bold */}
            <button
                className="sel-btn"
                onClick={handleBold}
                title="Bold"
            >
                <Bold size={14} strokeWidth={2.5} />
            </button>

            {/* Italic */}
            <button
                className="sel-btn"
                onClick={handleItalic}
                title="Italic"
            >
                <Italic size={14} strokeWidth={2.5} />
            </button>

            <div className="sel-divider" />

            {/* Highlight */}
            <div className="sel-btn-wrap">
                <button
                    className={`sel-btn ${showHighlightPicker ? 'active' : ''}`}
                    onClick={() => {
                        setShowHighlightPicker(!showHighlightPicker);
                        setShowColorPicker(false);
                        setShowSizePicker(false);
                    }}
                    title="Highlight"
                >
                    <Highlighter size={14} />
                </button>
                {showHighlightPicker && (
                    <div className="sel-popup">
                        <div className="sel-popup-label">Highlight</div>
                        <div className="sel-colors">
                            {HIGHLIGHT_COLORS.map(c => (
                                <button
                                    key={c}
                                    className="sel-color-dot"
                                    style={{ background: c }}
                                    onClick={() => handleHighlight(c)}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Text Color */}
            <div className="sel-btn-wrap">
                <button
                    className={`sel-btn ${showColorPicker ? 'active' : ''}`}
                    onClick={() => {
                        setShowColorPicker(!showColorPicker);
                        setShowHighlightPicker(false);
                        setShowSizePicker(false);
                    }}
                    title="Text Color"
                >
                    <Palette size={14} />
                </button>
                {showColorPicker && (
                    <div className="sel-popup">
                        <div className="sel-popup-label">Text Color</div>
                        <div className="sel-colors">
                            {TEXT_COLORS.map(c => (
                                <button
                                    key={c}
                                    className="sel-color-dot"
                                    style={{ background: c, border: c === '#ffffff' ? '1.5px solid rgba(255,255,255,0.3)' : undefined }}
                                    onClick={() => handleColor(c)}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="sel-divider" />

            {/* Font Size */}
            <div className="sel-btn-wrap">
                <button
                    className={`sel-btn ${showSizePicker ? 'active' : ''}`}
                    onClick={() => {
                        setShowSizePicker(!showSizePicker);
                        setShowColorPicker(false);
                        setShowHighlightPicker(false);
                    }}
                    title="Font Size"
                >
                    <Type size={14} />
                </button>
                {showSizePicker && (
                    <div className="sel-popup sel-popup-sizes">
                        <div className="sel-popup-label">Font Size</div>
                        <div className="sel-size-grid">
                            {FONT_SIZES.map(sz => (
                                <button
                                    key={sz}
                                    className="sel-size-btn"
                                    onClick={() => handleFontSize(sz)}
                                >
                                    {sz}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <style>{toolbarStyles}</style>
        </div>,
        document.body
    );
}

/* ─── Premium Toolbar Styles ─── */
const toolbarStyles = `
  .sel-toolbar {
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 6px;
    background: rgba(18, 18, 22, 0.92);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.35),
      0 2px 8px rgba(0, 0, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
    animation: selToolbarIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: auto;
  }

  @keyframes selToolbarIn {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .sel-btn {
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.75);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.12s ease;
    padding: 0;
    position: relative;
  }

  .sel-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .sel-btn.active {
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
  }

  .sel-divider {
    width: 1px;
    height: 18px;
    background: rgba(255, 255, 255, 0.1);
    margin: 0 2px;
    flex-shrink: 0;
  }

  .sel-btn-wrap {
    position: relative;
  }

  /* ─── Popup Panels ─── */
  .sel-popup {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    background: rgba(22, 22, 28, 0.96);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 8px;
    min-width: 140px;
    box-shadow:
      0 12px 40px rgba(0, 0, 0, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
    animation: selPopupIn 0.15s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 10000;
  }

  @keyframes selPopupIn {
    from { opacity: 0; transform: translateX(-50%) translateY(4px) scale(0.95); }
    to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  }

  .sel-popup-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(255, 255, 255, 0.4);
    padding: 0 2px 6px;
  }

  .sel-colors {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }

  .sel-color-dot {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 0.12s ease;
    padding: 0;
  }

  .sel-color-dot:hover {
    transform: scale(1.2);
    border-color: rgba(255, 255, 255, 0.4);
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.15);
  }

  /* ─── Size Picker ─── */
  .sel-popup-sizes {
    min-width: 120px;
  }

  .sel-size-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 3px;
  }

  .sel-size-btn {
    padding: 4px 0;
    border: none;
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.7);
    border-radius: 5px;
    font-size: 11px;
    font-weight: 600;
    font-family: var(--font-mono, monospace);
    cursor: pointer;
    transition: all 0.1s ease;
    text-align: center;
  }

  .sel-size-btn:hover {
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
    transform: scale(1.05);
  }
`;
