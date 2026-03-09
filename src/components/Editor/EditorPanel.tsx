import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../lib/store';
import { db } from '../../lib/db';
import { useEditor } from './useEditor';
import StickerPicker from './StickerPicker';
import StickerOverlay from './StickerOverlay';
import BlockPicker from './BlockPicker';
import DocumentRenderer from '../Blocks/DocumentRenderer';
import type { PlacedSticker, Note } from '../../lib/db';



import { countWords, readingTime, extractTags, extractTitle, extractLinks, useDebounce } from '../../lib/utils';
import { formatContextualTime } from '../../lib/temporal';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import {
  MoreHorizontal,
  Star,
  Trash2,
  Copy,
  Download,
  ChevronRight,
  AlertTriangle,
  BookOpen,
  Hash,
  Plus,
  Search,
  X
} from 'lucide-react';

export default function EditorPanel() {
  const activeNoteId = useStore((s) => s.activeNoteId);
  const notes = useStore((s) => s.notes);
  const folders = useStore((s) => s.folders);
  const updateNote = useStore((s) => s.updateNote);
  const deleteNote = useStore((s) => s.deleteNote);
  const starNote = useStore((s) => s.starNote);
  const setActiveNoteId = useStore((s) => s.setActiveNoteId);
  const closeNoteTab = useStore((s) => s.closeNoteTab);
  const openNoteIds = useStore((s) => s.openNoteIds);
  const focusMode = useStore((s) => s.focusMode);
  const isDocumentMode = useStore((s) => s.isDocumentMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const viewModeByNoteId = useStore((s) => s.viewModeByNoteId);

  const notesById = useMemo(() => {
    const map = new Map<string, Note>();
    for (const note of notes) map.set(note.id, note);
    return map;
  }, [notes]);

  const activeNote = useMemo(
    () => (activeNoteId ? notesById.get(activeNoteId) : undefined),
    [activeNoteId, notesById]
  );

  const similarNote = useMemo(() => {
    if (!activeNote?.similarNoteId) return null;
    const note = notesById.get(activeNote.similarNoteId);
    return note && !note.trashed ? note : null;
  }, [activeNote, notesById]);

  const currentFolder = useMemo(
    () => (activeNote ? folders.find((f) => f.id === activeNote.folderId) : null),
    [activeNote, folders]
  );
  const openTabs = useMemo(() => {
    const result: Note[] = [];
    for (const id of openNoteIds) {
      const note = notesById.get(id);
      if (note && !note.trashed) result.push(note);
    }
    return result;
  }, [openNoteIds, notesById]);
  const allPickableNotes = useMemo(
    () => [...notes]
      .filter((n) => !n.trashed)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [notes]
  );

  const [wordCount, setWordCount] = useState(0);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState(false);
  const [placedStickers, setPlacedStickers] = useState<PlacedSticker[]>([]);
  const [isDropActive, setIsDropActive] = useState(false);
  const [showTabPicker, setShowTabPicker] = useState(false);
  const [tabQuery, setTabQuery] = useState('');
  const [isTabDropActive, setIsTabDropActive] = useState(false);
  const [isEmptyDropActive, setIsEmptyDropActive] = useState(false);
  const [dragOpenedNoteId, setDragOpenedNoteId] = useState<string | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();


  const moreMenuRef = useRef<HTMLDivElement>(null);
  const tabPickerRef = useRef<HTMLDivElement>(null);
  const tabPickerButtonRef = useRef<HTMLButtonElement>(null);
  const tabsBarRef = useRef<HTMLDivElement>(null);
  const dragOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragOpenRafRef = useRef<number | null>(null);
  const openFromDrag = useCallback((noteId: string) => {
    setActiveNoteId(noteId);
    if (prefersReducedMotion) return;
    setDragOpenedNoteId(null);
    if (dragOpenRafRef.current !== null) {
      cancelAnimationFrame(dragOpenRafRef.current);
      dragOpenRafRef.current = null;
    }
    dragOpenRafRef.current = requestAnimationFrame(() => {
      setDragOpenedNoteId(noteId);
      dragOpenRafRef.current = null;
    });
    if (dragOpenTimerRef.current) clearTimeout(dragOpenTimerRef.current);
    dragOpenTimerRef.current = setTimeout(() => {
      setDragOpenedNoteId(null);
      dragOpenTimerRef.current = null;
    }, 460);
  }, [setActiveNoteId, prefersReducedMotion]);

  // Slash menu state
  const [slashMenu, setSlashMenu] = useState<{ top: number; left: number } | null>(null);

  // Auto-save debounced
  const debouncedSave = useDebounce((content: string, noteId: string) => {
    const title = extractTitle(content);
    const tags = extractTags(content);
    const wc = countWords(content);
    const links = extractLinks(content);
    updateNote(noteId, { content, title, tags, links, wordCount: wc });
    setWordCount(wc);
    setSaveIndicator(true);
    setTimeout(() => setSaveIndicator(false), 600);
  }, 800);

  const activeNoteIdRef = useRef(activeNoteId);
  useEffect(() => {
    activeNoteIdRef.current = activeNoteId;
  }, [activeNoteId]);

  const [liveContent, setLiveContent] = useState<string>('');

  useEffect(() => {
    // Drop the latest content buffer when we switch to a completely different note
    const resetId = window.setTimeout(() => {
      setLiveContent('');
    }, 0);
    return () => window.clearTimeout(resetId);
  }, [activeNoteId]);

  useEffect(() => {
    if (!activeNoteId) return;
    const noteMode = viewModeByNoteId[activeNoteId];
    if (!noteMode) {
      if (isDocumentMode) setViewMode('raw', activeNoteId);
      return;
    }
    const shouldBePreview = noteMode === 'preview';
    if (shouldBePreview === isDocumentMode) return;
    setViewMode(noteMode, activeNoteId);
  }, [activeNoteId, viewModeByNoteId, setViewMode, isDocumentMode]);

  const handleChange = useCallback(
    (content: string) => {
      setLiveContent(content);
      if (activeNoteIdRef.current) {
        debouncedSave(content, activeNoteIdRef.current);
      }
    },
    [debouncedSave]
  );

  // ALL HOOKS called BEFORE any conditional returns
  const { containerRef, viewRef, setContent, focus, ready, insertText, getCursorCoords, getLineAtHeight, getLineBlock } = useEditor({
    onChange: handleChange,
    onSlash: () => {
      const coords = getCursorCoords();
      if (coords) {
        setSlashMenu({ top: coords.top, left: coords.left });
      }
    }
  });

  // --- Connections Logic ---
  const notesByLowerTitle = useMemo(() => {
    const map = new Map<string, Note>();
    for (const note of notes) {
      if (note.trashed || !note.title) continue;
      map.set(note.title.toLowerCase(), note);
    }
    return map;
  }, [notes]);

  const forwardLinks = useMemo(() => {
    if (!activeNote || !activeNote.links) return [];
    return activeNote.links
      .map(title => notesByLowerTitle.get(title.toLowerCase()))
      .filter((n): n is Note => n !== undefined);
  }, [activeNote, notesByLowerTitle]);

  const backlinks = useMemo(() => {
    if (!activeNote || !activeNote.title) return [];
    const lowerTitle = activeNote.title.toLowerCase();
    return notes.filter(n =>
      !n.trashed &&
      n.id !== activeNote.id &&
      n.links?.some(l => l.toLowerCase() === lowerTitle)
    );
  }, [activeNote, notes]);

  const [showConnectMenu, setShowConnectMenu] = useState(false);
  const [connectSearch, setConnectSearch] = useState('');
  const connectMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (connectMenuRef.current && !connectMenuRef.current.contains(e.target as Node)) {
        setShowConnectMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddConnection = useCallback((targetNote: Note) => {
    if (viewRef.current) {
      const curDoc = viewRef.current.state.doc.toString();
      const insertText = curDoc.endsWith('\n') ? `\n[[${targetNote.title}]]` : `\n\n[[${targetNote.title}]]`;
      viewRef.current.dispatch({
        changes: { from: curDoc.length, insert: insertText }
      });
    } else if (activeNoteId && activeNote) {
      const curDoc = activeNote.content || '';
      const insertText = curDoc.endsWith('\n') ? `\n[[${targetNote.title}]]` : `\n\n[[${targetNote.title}]]`;
      const newContent = curDoc + insertText;
      updateNote(activeNoteId, { content: newContent, links: extractLinks(newContent) });
    }
    setShowConnectMenu(false);
    setConnectSearch('');
  }, [viewRef, activeNoteId, activeNote, updateNote]);
  // -------------------------

  // Update editor when note changes (or when editor becomes ready)
  useEffect(() => {
    if (activeNote && ready) {
      const timer = setTimeout(() => {
        const textToLoad = activeNote.content ?? '';
        setContent(textToLoad);
        setWordCount(countWords(textToLoad));
        setPlacedStickers(activeNote.placedStickers || []);
        setLiveContent(textToLoad);

        focus();
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [activeNote, setContent, focus, ready]);

  useEffect(() => {
    if (!activeNoteId || isDocumentMode || !ready) return;
    const frame = window.requestAnimationFrame(() => {
      focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeNoteId, isDocumentMode, ready, focus]);

  useEffect(() => {
    if (!activeNoteId && openTabs.length > 0) {
      setActiveNoteId(openTabs[0].id);
    }
  }, [activeNoteId, openTabs, setActiveNoteId]);



  // Handle placing a new sticker
  const handlePlaceSticker = useCallback(
    (placed: PlacedSticker) => {
      if (!activeNoteId) return;
      setPlacedStickers((prev) => {
        const next = [...prev, placed];
        updateNote(activeNoteId, { placedStickers: next });
        return next;
      });
    },
    [activeNoteId, updateNote]
  );

  // Handle updates from overlay (drag, resize, rotate, delete)
  const handleOverlayUpdate = useCallback(
    (stickers: PlacedSticker[]) => {
      setPlacedStickers(stickers);
      if (activeNoteId) {
        updateNote(activeNoteId, { placedStickers: stickers });
      }
    },
    [activeNoteId, updateNote]
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      if (!activeNoteId) return;

      const textData = e.clipboardData.getData('text/plain');
      let stickerIdToPlace: string | null = null;
      if (textData && textData.startsWith('leaf-sticker:')) {
        stickerIdToPlace = textData.replace('leaf-sticker:', '');
      }

      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (!blob) continue;

          if (stickerIdToPlace) {
            if (!isDocumentMode) return;
            const sticker = await db.stickers.get(stickerIdToPlace);
            if (sticker) {
              handlePlaceSticker({
                stickerId: sticker.id,
                x: 10 + Math.random() * 40,
                y: 10 + Math.random() * 40,
                scale: 1,
                rotation: 0
              });
              return;
            }
          }

          if (!isDocumentMode) return;

          // If no sticker idea from clipboard text, it's an external pasted image
          const newId = crypto.randomUUID();
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.src = url;
          await new Promise<void>((r) => { img.onload = () => r(); });

          const canvas = document.createElement('canvas');
          const maxThumb = 200;
          const scale = Math.min(maxThumb / img.width, maxThumb / img.height, 1);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const thumbUrl = canvas.toDataURL('image/png');

          await db.stickers.put({
            id: newId,
            name: `Pasted Image`,
            originalBlob: blob,
            stickerBlob: blob,
            thumbnailUrl: thumbUrl,
            width: img.width,
            height: img.height,
            createdAt: Date.now(),
          });
          URL.revokeObjectURL(url);

          handlePlaceSticker({
            stickerId: newId,
            x: 10 + Math.random() * 40,
            y: 10 + Math.random() * 40,
            scale: 1,
            rotation: 0
          });
          return;
        }
      }
    },
    [activeNoteId, handlePlaceSticker, isDocumentMode]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer.types).map(t => t.toLowerCase());
    const isSticker = types.includes('stickerid');
    const isNoteLink = types.includes('text/plain');
    if ((isSticker && isDocumentMode) || (!isSticker && isNoteLink)) {
      e.preventDefault();
      setIsDropActive(true);
    }
  }, [isDocumentMode]);

  const handleDragLeave = useCallback(() => {
    setIsDropActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDropActive(false);

      // File/note drag from sidebar should open as a tab, not insert link text.
      const droppedNoteId = e.dataTransfer.getData('application/x-leaf-note-id');
      if (droppedNoteId) {
        const droppedNote = notes.find((n) => n.id === droppedNoteId && !n.trashed);
        if (droppedNote) {
          openFromDrag(droppedNote.id);
          return;
        }
      }

      // Check for note link drop
      const text = e.dataTransfer.getData('text/plain');
      if (text && text.startsWith('[[') && text.endsWith(']]')) {
        if (viewRef.current) {
          insertText(text);
        } else if (activeNoteId && activeNote) {
          const curDoc = activeNote.content || '';
          const newContent = curDoc.length === 0 ? text : curDoc + '\n\n' + text;
          updateNote(activeNoteId, { content: newContent, links: extractLinks(newContent) });
        }
        return;
      }

      // Check for sticker drop
      const stickerId = e.dataTransfer.getData('stickerId') || e.dataTransfer.getData('stickerid');
      if (stickerId) {
        if (!isDocumentMode || !activeNoteId) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;

        // Calculate anchor line
        const line = getLineAtHeight(clientY);
        const anchorLine = line ? viewRef.current?.state.doc.lineAt(line.from).number : undefined;
        const anchorOffset = line ? clientY - line.top : 0;

        handlePlaceSticker({
          stickerId,
          x: Math.max(0, Math.min(90, (clientX / rect.width) * 100 - 5)),
          y: Math.max(0, Math.min(90, (clientY / rect.height) * 100 - 5)),
          anchorLine,
          anchorOffset,
          scale: 1,
          rotation: 0
        });
      }
    },
    [activeNoteId, handlePlaceSticker, insertText, getLineAtHeight, viewRef, isDocumentMode, notes, openFromDrag, activeNote, updateNote]
  );

  // Close more menu on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
      const isInPicker = !!tabPickerRef.current?.contains(e.target as Node);
      const isInPickerButton = !!tabPickerButtonRef.current?.contains(e.target as Node);
      if (!isInPicker && !isInPickerButton) {
        setShowTabPicker(false);
      }
    };
    if (showMoreMenu) document.addEventListener('mousedown', handler);
    if (showTabPicker) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMoreMenu, showTabPicker]);

  useEffect(() => {
    if (!showTabPicker) {
      const resetId = window.setTimeout(() => {
        setTabQuery('');
      }, 0);
      return () => window.clearTimeout(resetId);
    }
  }, [showTabPicker]);

  useEffect(() => {
    return () => {
      if (dragOpenTimerRef.current) {
        clearTimeout(dragOpenTimerRef.current);
        dragOpenTimerRef.current = null;
      }
      if (dragOpenRafRef.current !== null) {
        cancelAnimationFrame(dragOpenRafRef.current);
        dragOpenRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (dragOpenTimerRef.current) {
        clearTimeout(dragOpenTimerRef.current);
        dragOpenTimerRef.current = null;
      }
    };
  }, []);

  const handleTabBarDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const types = Array.from(e.dataTransfer.types).map((t) => t.toLowerCase());
    if (types.includes('application/x-leaf-note-id') || types.includes('text/plain')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsTabDropActive(true);
    }
  }, []);

  const handleTabBarDragLeave = useCallback(() => {
    setIsTabDropActive(false);
  }, []);

  const handleTabBarDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsTabDropActive(false);

    const droppedNoteId = e.dataTransfer.getData('application/x-leaf-note-id');
    if (droppedNoteId) {
      const droppedNote = notes.find((n) => n.id === droppedNoteId && !n.trashed);
      if (droppedNote) {
        openFromDrag(droppedNote.id);
        return;
      }
    }

    // Fallback for legacy plain-text drag payloads like [[Note Title]]
    const text = e.dataTransfer.getData('text/plain');
    if (text.startsWith('[[') && text.endsWith(']]')) {
      const title = text.slice(2, -2).trim().toLowerCase();
      const droppedByTitle = notes.find((n) => !n.trashed && (n.title || '').trim().toLowerCase() === title);
      if (droppedByTitle) {
        openFromDrag(droppedByTitle.id);
      }
    }
  }, [notes, openFromDrag]);

  const handleEmptyAreaDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const types = Array.from(e.dataTransfer.types).map((t) => t.toLowerCase());
    if (types.includes('application/x-leaf-note-id') || types.includes('text/plain')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsEmptyDropActive(true);
    }
  }, []);

  const handleEmptyAreaDragLeave = useCallback(() => {
    setIsEmptyDropActive(false);
  }, []);

  const handleEmptyAreaDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsEmptyDropActive(false);

    const droppedNoteId = e.dataTransfer.getData('application/x-leaf-note-id');
    if (droppedNoteId) {
      const droppedNote = notes.find((n) => n.id === droppedNoteId && !n.trashed);
      if (droppedNote) {
        openFromDrag(droppedNote.id);
        return;
      }
    }

    const text = e.dataTransfer.getData('text/plain');
    if (text.startsWith('[[') && text.endsWith(']]')) {
      const title = text.slice(2, -2).trim().toLowerCase();
      const droppedByTitle = notes.find((n) => !n.trashed && (n.title || '').trim().toLowerCase() === title);
      if (droppedByTitle) {
        openFromDrag(droppedByTitle.id);
      }
    }
  }, [notes, openFromDrag]);

  useEffect(() => {
    if (!activeNoteId || !tabsBarRef.current) return;
    const activeTab = tabsBarRef.current.querySelector<HTMLButtonElement>(`[data-tab-id="${activeNoteId}"]`);
    activeTab?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', inline: 'nearest', block: 'nearest' });
  }, [activeNoteId, prefersReducedMotion]);

  const [tabPickerPosition, setTabPickerPosition] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);

  useEffect(() => {
    if (!showTabPicker) {
      const resetId = window.setTimeout(() => {
        setTabPickerPosition(null);
      }, 0);
      return () => window.clearTimeout(resetId);
    }

    const updatePosition = () => {
      if (!tabPickerButtonRef.current) return;
      const rect = tabPickerButtonRef.current.getBoundingClientRect();
      const EDGE = 12;
      const WIDTH = Math.min(360, Math.max(260, window.innerWidth - EDGE * 2));
      const HEIGHT = 320;
      const left = Math.max(EDGE, Math.min(rect.right - WIDTH, window.innerWidth - WIDTH - EDGE));
      const preferTop = rect.bottom + 8 + HEIGHT > window.innerHeight;
      const top = preferTop
        ? Math.max(EDGE, rect.top - HEIGHT - 8)
        : Math.min(window.innerHeight - HEIGHT - EDGE, rect.bottom + 8);
      setTabPickerPosition({ left, top, width: WIDTH, maxHeight: HEIGHT });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [showTabPicker]);

  const filteredPickableNotes = useMemo(() => {
    const q = tabQuery.trim().toLowerCase();
    if (!q) return allPickableNotes;
    return allPickableNotes.filter((note) =>
      (note.title || '').toLowerCase().includes(q) ||
      (note.content || '').toLowerCase().includes(q)
    );
  }, [allPickableNotes, tabQuery]);

  const tabPickerPortal = showTabPicker && tabPickerPosition ? createPortal(
    <div
      className="tab-picker-menu acrylic"
      ref={tabPickerRef}
      style={tabPickerPosition}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="tab-picker-header">
        <span>Open Note</span>
        <span>{filteredPickableNotes.length}</span>
      </div>
      <div className="tab-picker-search">
        <Search size={13} />
        <input
          autoFocus
          value={tabQuery}
          onChange={(e) => setTabQuery(e.target.value)}
          placeholder="Search notes..."
        />
      </div>
      {filteredPickableNotes.length === 0 ? (
        <div className="tab-picker-empty">No matching notes</div>
      ) : (
        filteredPickableNotes.map((note) => (
          <button
            key={note.id}
            className={`tab-picker-item ${activeNoteId === note.id ? 'active' : ''}`}
            onClick={() => {
              setActiveNoteId(note.id);
              setShowTabPicker(false);
            }}
          >
            <span className="tab-picker-item-title">{note.title || 'Untitled'}</span>
            <span className="tab-picker-item-meta">
              {openNoteIds.includes(note.id) ? 'Open' : formatContextualTime(note)}
            </span>
          </button>
        ))
      )}
    </div>,
    document.body
  ) : null;

  // Empty state — rendered AFTER all hooks
  if (!activeNote) {
    return (
      <div className={`editor-panel ${dragOpenedNoteId ? 'opened-by-drag' : ''} animate-in`}>
        {openTabs.length > 0 && (
          <div
            className={`editor-tabs-bar ${isTabDropActive ? 'drop-active' : ''}`}
            ref={tabsBarRef}
            onDragOver={handleTabBarDragOver}
            onDragLeave={handleTabBarDragLeave}
            onDrop={handleTabBarDrop}
          >
            {openTabs.map((tab) => (
              <button
                key={tab.id}
                data-tab-id={tab.id}
                className={`editor-tab ${tab.id === activeNoteId ? 'active' : ''} ${dragOpenedNoteId === tab.id ? 'opened-by-drag' : ''}`}
                onClick={() => setActiveNoteId(tab.id)}
              >
                <span className="editor-tab-title">{tab.title || 'Untitled'}</span>
                <span
                  className="editor-tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeNoteTab(tab.id);
                  }}
                >
                  <X size={12} />
                </span>
              </button>
            ))}
            <button
              ref={tabPickerButtonRef}
              className="editor-tab-add"
              title="Open Note Tab"
              onClick={() => setShowTabPicker((v) => !v)}
            >
              <Plus size={14} />
            </button>
            {tabPickerPortal}
          </div>
        )}
        <div
          className={`editor-empty ${isEmptyDropActive ? 'drop-active' : ''}`}
          onDragOver={handleEmptyAreaDragOver}
          onDragLeave={handleEmptyAreaDragLeave}
          onDrop={handleEmptyAreaDrop}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center', padding: 40
          }}
        >
          <div className="editor-empty-leaf" style={{ animation: 'intelFadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) backwards', animationDelay: '0.1s', fontSize: 64 }}>🍃</div>
          <h1 className="intel-premium-title" style={{ animation: 'intelFadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) backwards', animationDelay: '0.2s', fontSize: '56px', margin: 0 }}>Leaf</h1>
          <p className="intel-premium-subtitle" style={{ animation: 'intelFadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) backwards', animationDelay: '0.3s', maxWidth: 400, opacity: 0.8 }}>
            No Ai. Just notes
          </p>
        </div>
        <style>{editorStyles}</style>
      </div>
    );
  }

  return (
    <div className={`editor-panel ${focusMode ? 'focus-mode' : ''} ${dragOpenedNoteId ? 'opened-by-drag' : ''} animate-in`}>
      <div
        className={`editor-tabs-bar ${isTabDropActive ? 'drop-active' : ''}`}
        ref={tabsBarRef}
        onDragOver={handleTabBarDragOver}
        onDragLeave={handleTabBarDragLeave}
        onDrop={handleTabBarDrop}
      >
        {openTabs.map((tab) => (
          <button
            key={tab.id}
            data-tab-id={tab.id}
            className={`editor-tab ${tab.id === activeNote.id ? 'active' : ''} ${dragOpenedNoteId === tab.id ? 'opened-by-drag' : ''}`}
            onClick={() => setActiveNoteId(tab.id)}
            title={tab.title || 'Untitled'}
          >
            <span className="editor-tab-title">{tab.title || 'Untitled'}</span>
            <span
              className="editor-tab-close"
              onClick={(e) => {
                e.stopPropagation();
                closeNoteTab(tab.id);
              }}
              title="Close tab"
            >
              <X size={12} />
            </span>
          </button>
        ))}
        <button
          ref={tabPickerButtonRef}
          className="editor-tab-add"
          title="Open Note Tab"
          onClick={() => setShowTabPicker((v) => !v)}
        >
          <Plus size={14} />
        </button>
        {tabPickerPortal}
      </div>
      {/* Header bar */}
      <div className="editor-header">
        <div className="editor-breadcrumb">
          {currentFolder && (
            <>
              <span className="breadcrumb-folder">
                {currentFolder.icon} {currentFolder.name}
              </span>
              <ChevronRight size={12} className="breadcrumb-sep" />
            </>
          )}
          <span className="breadcrumb-note">
            {activeNote.title || 'Untitled'}
          </span>
        </div>

        {/* Mode Switch */}
        <div className="mode-switch-wrapper animate-in zoom-in-95 duration-200">
          <button
            type="button"
            className={`mode-pill ${!isDocumentMode ? 'active' : ''}`}
            onClick={() => {
              setViewMode('raw', activeNoteId);
              window.requestAnimationFrame(() => focus());
            }}
            aria-pressed={!isDocumentMode}
          >
            Raw
          </button>
          <button
            type="button"
            className={`mode-pill ${isDocumentMode ? 'active' : ''}`}
            onClick={() => setViewMode('preview', activeNoteId)}
            aria-pressed={isDocumentMode}
          >
            Preview
          </button>
        </div>

        <div className="editor-header-actions">

          {isDocumentMode && <StickerPicker onPlace={handlePlaceSticker} />}
          <div
            className={`save-dot ${saveIndicator ? 'pulse' : ''}`}
            title="Saved"
          />
          <button
            className={`editor-header-btn ${activeNote.starred ? 'starred' : ''}`}
            onClick={() => starNote(activeNote.id)}
            title="Star"
          >
            <Star
              size={15}
              fill={activeNote.starred ? 'var(--color-amber)' : 'none'}
              color={activeNote.starred ? 'var(--color-amber)' : 'currentColor'}
            />
          </button>

          <div className="editor-more-wrap" ref={moreMenuRef}>
            <button
              className="editor-header-btn"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              title="More actions"
            >
              <MoreHorizontal size={15} />
            </button>
            {showMoreMenu && (
              <div className="editor-more-menu">
                <button
                  onClick={() => {
                    starNote(activeNote.id);
                    setShowMoreMenu(false);
                  }}
                >
                  <Star size={14} />
                  {activeNote.starred ? 'Remove Star' : 'Add Star'}
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(activeNote.content);
                    setShowMoreMenu(false);
                  }}
                >
                  <Copy size={14} />
                  Copy as Markdown
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob([activeNote.content], {
                      type: 'text/markdown',
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${activeNote.title || 'untitled'}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                    setShowMoreMenu(false);
                  }}
                >
                  <Download size={14} />
                  Export Markdown
                </button>
                <div className="menu-divider" />
                <button
                  className="danger"
                  onClick={() => {
                    deleteNote(activeNote.id);
                    setShowMoreMenu(false);
                  }}
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>



      {/* Editor content */}
      <div
        className={`editor-scroll ${isDropActive ? 'drop-active' : ''}`}
        onPasteCapture={handlePaste}
        onDragOverCapture={handleDragOver}
        onDragLeaveCapture={handleDragLeave}
        onDropCapture={handleDrop}
      >
        <div className="editor-content">
          {isDocumentMode && (
            <StickerOverlay
              noteId={activeNote.id}
              placedStickers={placedStickers}
              onUpdate={handleOverlayUpdate}
              getLineBlock={getLineBlock}
              viewRef={viewRef}
            />
          )}

          {similarNote && (
            <div className="similar-note-banner animate-in">
              <AlertTriangle size={14} className="text-amber" />
              <span>
                <strong>Similar note exists:</strong> {similarNote.title || 'Untitled'}
              </span>
              <button
                className="similar-note-btn"
                onClick={() => setActiveNoteId(similarNote.id)}
              >
                Open Instead
              </button>
            </div>
          )}





          <div className="editor-meta">
            <span className="editor-meta-item">
              {new Date(activeNote.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
            {activeNote.tags.length > 0 && (
              <>
                {activeNote.tags.map((tag) => (
                  <span key={tag} className="editor-meta-tag">
                    <Hash size={12} /> {tag}
                  </span>
                ))}
              </>
            )}
            {activeNote.wordCount > 0 && (
              <span className="editor-meta-item">
                <BookOpen size={13} /> {Math.ceil(activeNote.wordCount / 200)} min read
              </span>
            )}
          </div>

          <div className="editor-content-container relative min-h-[500px]">
            <AnimatePresence mode="wait">
              {isDocumentMode ? (
                <motion.div
                  key="present"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.02 }}
                  transition={prefersReducedMotion ? { duration: 0.01 } : { duration: 0.22, ease: 'easeOut' }}
                  className="w-full"
                >
                  <DocumentRenderer
                    content={liveContent || activeNote.content || ''}
                    onChange={(val) => {
                      setLiveContent(val);
                      if (activeNoteId) updateNote(activeNoteId, { content: val });
                    }}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="edit"
                  initial={{ opacity: 0, scale: 1.02 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={prefersReducedMotion ? { duration: 0.01 } : { duration: 0.18, ease: 'easeIn' }}
                  className="w-full"
                >
                  <div ref={containerRef} className="cm-container" />
                  {!activeNote.content && (
                    <div className="editor-empty-hint pointer-events-none absolute bottom-12 left-12 right-12 text-center opacity-40">
                      <p className="text-sm font-medium">✨ Type / or (todo) to create intelligent blocks!</p>
                    </div>
                  )}
                  {slashMenu && (
                    <BlockPicker
                      anchor={slashMenu}
                      onClose={() => setSlashMenu(null)}
                      onSelect={(template) => {
                        insertText(template);
                        setSlashMenu(null);
                      }}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <motion.div
            key="connections"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0.01 } : { delay: 0.2, duration: 0.25 }}
            className="connections-visualizer animate-in fade-in duration-500"
          >
            <div className="connections-header">
              <span className="text-xs uppercase tracking-widest opacity-50 font-bold">Backlinks</span>
            </div>
            <div className="connections-list">
              {forwardLinks.map(n => (
                <button key={n.id} className="connection-chip forward-link" onClick={() => setActiveNoteId(n.id)}>
                  <span className="chip-icon">→</span> {n.title || 'Untitled'}
                </button>
              ))}
              {backlinks.map(n => (
                <button key={n.id} className="connection-chip backlink" onClick={() => setActiveNoteId(n.id)}>
                  <span className="chip-icon">←</span> {n.title || 'Untitled'}
                </button>
              ))}

              <div className="connection-add-wrapper" ref={connectMenuRef}>
                <button
                  className="connection-chip add-connection"
                  onClick={() => setShowConnectMenu(!showConnectMenu)}
                >
                  <Plus size={14} /> Connect Note
                </button>

                {showConnectMenu && (
                  <div className="connect-menu acrylic animate-in zoom-in-95 duration-200">
                    <div className="connect-search">
                      <Search size={14} className="text-secondary" />
                      <input
                        autoFocus
                        type="text"
                        placeholder="Search notes..."
                        value={connectSearch}
                        onChange={(e) => setConnectSearch(e.target.value)}
                      />
                    </div>
                    <div className="connect-options">
                      {notes
                        .filter(n => !n.trashed && n.id !== activeNote?.id && n.title.toLowerCase().includes(connectSearch.toLowerCase()))
                        .slice(0, 5)
                        .map(n => (
                          <button key={n.id} className="connect-option" onClick={() => handleAddConnection(n)}>
                            <BookOpen size={14} className="text-secondary" />
                            <span>{n.title || 'Untitled'}</span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Status bar */}
      <div className="editor-status-bar">
        <div className="status-left">
          <div className="status-dot synced" />
          <span>Local</span>
        </div>
        <div className="status-right">
          <span>{wordCount} words</span>
          <span className="status-sep">·</span>
          <span>{readingTime(wordCount)}</span>
        </div>
      </div>

      <style>{editorStyles}</style>
    </div >
  );
}

const editorStyles = `
  .editor-panel {
    flex: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-lg);
    min-width: 0;
    position: relative;
    overflow: hidden;
    transform: translateZ(0);
    contain: paint;
  }
  .editor-tabs-bar {
    height: 36px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    border-bottom: 1px solid var(--color-border);
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    flex-shrink: 0;
    position: relative;
    scroll-behavior: smooth;
    overscroll-behavior-x: contain;
    transition: background-color var(--dur-fast), box-shadow var(--dur-fast);
  }
  .editor-tabs-bar.drop-active {
    background: color-mix(in srgb, var(--color-accent-light) 80%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 30%, transparent);
  }
  .editor-tabs-bar::-webkit-scrollbar {
    display: none;
  }
  .editor-tab {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 120px;
    max-width: 240px;
    height: 28px;
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 0 8px;
    background: transparent;
    color: var(--color-text-3);
    cursor: pointer;
    flex-shrink: 0;
    transition: background-color var(--dur-fast), color var(--dur-fast), border-color var(--dur-fast), transform var(--dur-fast);
    will-change: transform;
  }
  .editor-tab:hover {
    background: var(--color-surface-2);
    color: var(--color-text-1);
    transform: translateY(-1px);
  }
  .editor-tab.active {
    background: var(--color-surface-3);
    border-color: var(--color-border);
    color: var(--color-text-1);
  }
  .editor-tab.opened-by-drag {
    animation: tab-opened-from-drag 220ms var(--spring-smooth);
  }
  .editor-tab-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    flex: 1;
    text-align: left;
  }
  .editor-tab-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    color: var(--color-text-4);
    transition: background-color var(--dur-fast), color var(--dur-fast);
  }
  .editor-tab-close:hover {
    background: var(--color-surface-2);
    color: var(--color-text-2);
  }
  .editor-tab-add {
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--color-text-3);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background-color var(--dur-fast), color var(--dur-fast), transform var(--dur-fast);
  }
  .editor-tab-add:hover {
    background: var(--color-surface-2);
    color: var(--color-text-1);
    transform: translateY(-1px);
  }
  .tab-picker-menu {
    position: fixed;
    width: 360px;
    max-height: 320px;
    overflow-y: auto;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: color-mix(in srgb, var(--color-surface) 58%, transparent);
    box-shadow: var(--shadow-lg);
    z-index: 130;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
    -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
    contain: layout paint;
  }
  .tab-picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-4);
    padding: 6px 8px 4px;
  }
  .tab-picker-search {
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 7px 9px;
    background: var(--color-surface-2);
    margin: 2px 4px 6px;
    color: var(--color-text-3);
  }
  .tab-picker-search input {
    width: 100%;
    border: none;
    background: transparent;
    color: var(--color-text-2);
    font-size: 12px;
    outline: none;
  }
  .tab-picker-item {
    width: 100%;
    border: none;
    background: transparent;
    color: var(--color-text-2);
    border-radius: 8px;
    padding: 8px 10px;
    text-align: left;
    cursor: pointer;
    transition: background-color var(--dur-fast), color var(--dur-fast);
  }
  .tab-picker-item:hover {
    background: var(--color-surface-2);
    color: var(--color-text-1);
  }
  .tab-picker-item.active {
    background: var(--color-surface-3);
    color: var(--color-text-1);
  }
  .tab-picker-item-title {
    font-size: 13px;
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }
  .tab-picker-item-meta {
    font-size: 11px;
    color: var(--color-text-4);
    margin-top: 3px;
    display: block;
  }
  .tab-picker-empty {
    font-size: 13px;
    color: var(--color-text-3);
    padding: 10px;
  }
  .editor-panel.focus-mode .editor-header,
  .editor-panel.focus-mode .editor-tabs-bar,
  .editor-panel.focus-mode .editor-status-bar {
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--dur-normal);
  }
  .editor-panel.focus-mode:hover .editor-header,
  .editor-panel.focus-mode:hover .editor-tabs-bar,
  .editor-panel.focus-mode:hover .editor-status-bar {
    opacity: 1;
    pointer-events: auto;
  }

  /* Header */
  .editor-header {
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
    position: relative;
    z-index: 50;
  }
  .editor-breadcrumb {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--text-sm);
    color: var(--color-text-3);
    min-width: 0;
    flex: 1;
  }
  .breadcrumb-folder {
    cursor: pointer;
    transition: color var(--dur-fast);
  }
  .breadcrumb-folder:hover {
    color: var(--color-text-1);
  }

  .editor-scroll-area {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    scroll-behavior: smooth;
  }
  .editor-content {
    max-width: 800px;
    margin: 0 auto;
    padding: 40px 32px 80px 32px;
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 100%;
  }

  .connections-visualizer {
    margin-top: auto;
    padding-top: 40px;
    border-top: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .connections-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .connections-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .connection-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: var(--radius-full);
    font-size: var(--text-sm);
    font-family: var(--font-ui);
    cursor: pointer;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-2);
    transition: background-color var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast);
  }
  .connection-chip:hover {
    background: var(--color-surface-2);
    border-color: var(--color-accent);
    color: var(--color-text-1);
  }
  .connection-chip.add-connection {
    border-style: dashed;
    background: transparent;
  }
  .connection-chip.add-connection:hover {
    background: var(--color-surface);
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
  .chip-icon {
    font-family: var(--font-mono);
    opacity: 0.5;
  }
  .connection-add-wrapper {
    position: relative;
  }
  .connect-menu {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    width: 280px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg), 0 0 0 1px rgba(255,255,255,0.05) inset;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    z-index: 100;
  }
  .connect-search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--color-surface-2);
    border-radius: var(--radius-md);
    margin-bottom: 4px;
  }
  .connect-search input {
    background: transparent;
    border: none;
    color: var(--color-text-1);
    font-size: var(--text-sm);
    outline: none;
    width: 100%;
  }
  .connect-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    color: var(--color-text-1);
    font-size: var(--text-sm);
    cursor: pointer;
    transition: background-color var(--dur-fast);
  }
  .connect-option:hover {
    background: var(--color-surface-2);
  }

  .editor-content-container {
    cursor: text;
    transition: color var(--dur-fast);
  }
  .breadcrumb-folder:hover { color: var(--color-text-1); }
  .breadcrumb-sep { color: var(--color-text-4); }
  .breadcrumb-note {
    color: var(--color-text-2);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  /* Focus Timer */
  .focus-timer {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--color-surface-2);
    padding: 4px 12px;
    border-radius: var(--radius-full);
    border: 1px solid var(--color-border);
    margin: 0 16px;
  }
  .timer-display {
    font-family: var(--font-mono);
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text-2);
    font-variant-numeric: tabular-nums;
  }
  .timer-display.active {
    color: var(--color-accent);
  }
  .timer-controls {
    display: flex;
    gap: 4px;
  }
  .timer-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    border: none;
    background: transparent;
    color: var(--color-text-3);
    cursor: pointer;
    transition: background-color var(--dur-fast), color var(--dur-fast), transform var(--dur-fast);
  }
  .timer-btn:hover {
    background: var(--color-surface-3);
    color: var(--color-text-1);
  }

  .editor-header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .editor-header-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--color-text-3);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background-color var(--dur-fast), color var(--dur-fast);
  }
  .editor-header-btn:hover {
    background: var(--color-surface-2);
    color: var(--color-text-1);
  }
  .editor-header-btn.starred { color: var(--color-amber); }

  /* Save dot */
  .save-dot {
    width: 6px;
    height: 6px;
    border-radius: var(--radius-full);
    background: var(--color-text-4);
    transition: background var(--dur-normal);
    margin-right: 4px;
  }
  .save-dot.pulse {
    background: var(--color-teal);
    animation: pulse-sync 600ms ease;
  }

  /* More menu */
  .editor-more-wrap { position: relative; }
  .editor-more-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl);
    min-width: 200px;
    padding: 6px;
    z-index: 50;
  }
  .editor-more-menu button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    border: none;
    background: transparent;
    color: var(--color-text-2);
    font-size: var(--text-sm);
    font-family: var(--font-ui);
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    transition: background-color var(--dur-fast);
  }
  .editor-more-menu button:hover {
    background: var(--color-surface-2);
  }
  .editor-more-menu button.danger {
    color: var(--color-red);
  }
  .editor-more-menu button.danger:hover {
    background: var(--color-red-light);
  }
  .menu-divider {
    height: 1px;
    background: var(--color-border);
    margin: 4px 0;
  }

  /* Editor scroll & content */
  .editor-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 0 20px;
    position: relative;
    transition: background-color var(--dur-fast);
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    -webkit-overflow-scrolling: touch;
  }
  .editor-panel.opened-by-drag .editor-content {
    animation: editor-opened-from-drag 260ms var(--spring-smooth);
  }
  .editor-scroll.drop-active {
    background-color: var(--color-accent-light);
  }
  .editor-content {
    max-width: var(--editor-width);
    margin: 0 auto;
    padding: 24px 0 200px;
    position: relative;
    z-index: 1;
    contain: layout paint;
  }
  .editor-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: var(--text-xs);
    color: var(--color-text-3);
    margin-bottom: 16px;
    flex-wrap: wrap;
    font-family: var(--font-ui);
  }
  .editor-meta-item {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--color-text-3);
  }
  .editor-meta-tag {
    display: flex;
    align-items: center;
    gap: 3px;
    background: var(--color-accent-light);
    padding: 2px 8px;
    border-radius: var(--radius-full);
    color: var(--color-accent);
    font-weight: 600;
  }

  /* Similar Note Banner */
  .similar-note-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--color-amber-light);
    color: var(--color-amber-dark);
    padding: 10px 14px;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    margin-bottom: 16px;
    border: 1px solid rgba(245, 158, 11, 0.2);
  }
  .similar-note-banner strong {
    font-weight: 600;
  }
  .similar-note-btn {
    margin-left: auto;
    background: rgba(245, 158, 11, 0.2);
    color: var(--color-amber-dark);
    border: none;
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-weight: 500;
    cursor: pointer;
    transition: background var(--dur-fast);
  }
  .similar-note-btn:hover {
    background: rgba(245, 158, 11, 0.3);
  }


  .pulse-text {
    animation: pulse-sync 1.5s infinite;
  }

  /* CodeMirror container */
  .cm-container .cm-editor {
    min-height: 300px;
  }

  /* Status bar */
  .editor-status-bar {
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    border-top: 1px solid var(--color-border);
    background: var(--color-surface-2);
    font-size: var(--text-xs);
    color: var(--color-text-3);
    flex-shrink: 0;
  }
  .status-left, .status-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: var(--radius-full);
  }
  .status-dot.synced { background: var(--color-teal); }
  .status-dot.syncing { background: var(--color-amber); animation: pulse-sync 1s infinite; }
  .status-dot.offline { background: var(--color-text-4); }
  .status-sep { color: var(--color-text-4); }

  /* Empty state */
  .editor-empty-leaf {
    animation: gentle-sway 4s ease-in-out infinite, intelFadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) backwards;
    will-change: transform;
  }
  .editor-empty {
    transition: background-color var(--dur-fast), box-shadow var(--dur-fast);
  }
  .editor-empty.drop-active {
    background: color-mix(in srgb, var(--color-accent-light) 70%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 30%, transparent);
  }
  @keyframes tab-opened-from-drag {
    0% {
      opacity: 0.88;
    }
    100% {
      opacity: 1;
    }
  }
  @keyframes editor-opened-from-drag {
    0% {
      opacity: 0.9;
    }
    100% {
      opacity: 1;
    }
  }
  @keyframes gentle-sway {
    0%, 100% { transform: rotate(-3deg); }
    50% { transform: rotate(3deg); }
  }
`;
