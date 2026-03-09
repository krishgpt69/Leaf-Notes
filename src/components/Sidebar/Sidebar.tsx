import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../lib/store';
import { INBOX_FOLDER_ID, type Note, type Folder } from '../../lib/db';
import { extractPreviewText } from '../../lib/utils';
import { formatContextualTime, formatExactTime } from '../../lib/temporal';
import { useToast } from '../Toast';
import {
  Plus,
  Search,
  Inbox,
  Calendar,
  Clock,
  Star,
  Trash2,
  ChevronRight,
  FileText,
  FolderPlus,
  CheckCircle2,
  Circle,
  X,
  Flame,
  CheckSquare,
  Square,
  RotateCcw
} from 'lucide-react';

const smartFolders = [
  { id: '__inbox', label: 'Inbox', icon: Inbox, color: 'var(--color-accent)' },
  { id: '__today', label: 'Today', icon: Calendar, color: 'var(--color-teal)' },
  { id: '__recent', label: 'Recent', icon: Clock, color: 'var(--color-text-3)' },
  { id: '__starred', label: 'Starred', icon: Star, color: 'var(--color-amber)' },
  { id: '__search', label: 'Advanced Search', icon: Search, color: 'var(--color-text-2)' },
  { id: '__trash', label: 'Trash', icon: Trash2, color: 'var(--color-red)' },
];
const ROOT_FOLDER_KEY = '__root__';

function GettingStartedWidget({ notesCount, foldersCount, onDismiss }: { notesCount: number, foldersCount: number, onDismiss: () => void }) {
  const hasNote = notesCount > 1; // 1 is the welcome note
  const hasFolder = foldersCount > 1; // 1 is the Inbox
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('leaf_hide_onboarding') === 'true');

  if (dismissed) return null;

  const progress = (hasNote ? 1 : 0) + (hasFolder ? 1 : 0);
  const isComplete = progress === 2;

  const handleDismiss = () => {
    localStorage.setItem('leaf_hide_onboarding', 'true');
    setDismissed(true);
    if (onDismiss) onDismiss();
  };

  return (
    <div className="onboarding-widget animate-in">
      <div className="onboarding-header">
        <h5>Getting Started</h5>
        <button onClick={handleDismiss} className="onboarding-close" title="Dismiss">
          <X size={14} />
        </button>
      </div>

      <div className="onboarding-progress-bar">
        <div className="onboarding-progress-fill" style={{ width: `${(progress / 2) * 100}%` }} />
      </div>

      <ul className="onboarding-steps">
        <li className={hasNote ? 'completed' : ''}>
          <div className="step-check">
            {hasNote ? <CheckCircle2 size={14} /> : <Circle size={14} />}
          </div>
          <span>Write your first note</span>
        </li>
        <li className={hasFolder ? 'completed' : ''}>
          <div className="step-check">
            {hasFolder ? <CheckCircle2 size={14} /> : <Circle size={14} />}
          </div>
          <span>Create a custom folder</span>
        </li>
      </ul>

      {isComplete && (
        <div className="onboarding-success">
          <span>All done! Ready to use Leaf.</span>
          <button onClick={handleDismiss}>Dismiss</button>
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const notes = useStore((s) => s.notes);
  const folders = useStore((s) => s.folders);
  const activeFolderId = useStore((s) => s.activeFolderId);
  const activeNoteId = useStore((s) => s.activeNoteId);
  const setActiveFolderId = useStore((s) => s.setActiveFolderId);
  const setActiveNoteId = useStore((s) => s.setActiveNoteId);
  const createNote = useStore((s) => s.createNote);
  const createFolder = useStore((s) => s.createFolder);
  const toggleCommandPalette = useStore((s) => s.toggleCommandPalette);
  const setActiveSection = useStore((s) => s.setActiveSection);
  const deleteNote = useStore((s) => s.deleteNote);
  const undoDeleteNote = useStore((s) => s.undoDeleteNote);
  const restoreNote = useStore((s) => s.restoreNote);
  const permanentlyDeleteNote = useStore((s) => s.permanentlyDeleteNote);
  const streak = useStore((s) => s.streak);
  const todayActive = useStore((s) => s.todayActive);

  const selectedNoteIds = useStore((s) => s.selectedNoteIds);
  const toggleNoteSelection = useStore((s) => s.toggleNoteSelection);
  const clearSelection = useStore((s) => s.clearSelection);
  const selectAllNotes = useStore((s) => s.selectAllNotes);
  const deleteSelectedNotes = useStore((s) => s.deleteSelectedNotes);
  const emptyTrash = useStore((s) => s.emptyTrash);
  const restoreSelectedNotes = useStore((s) => s.restoreSelectedNotes);

  const { addToast } = useToast();

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set([INBOX_FOLDER_ID])
  );
  const [activeSmartFolder, setActiveSmartFolder] = useState<string | null>('__inbox');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [contextMenu, setContextMenu] = useState<{ id: string, x: number, y: number } | null>(null);
  const [trashContextMenu, setTrashContextMenu] = useState<{ x: number, y: number } | null>(null);
  const [infoNoteId, setInfoNoteId] = useState<string | null>(null);
  const [contextMenuSize, setContextMenuSize] = useState({ width: 196, height: 196 });
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [todayStartMs, setTodayStartMs] = useState(0);

  useEffect(() => {
    const syncTodayStart = () => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      setTodayStartMs(now.getTime());
    };
    syncTodayStart();
    const id = window.setInterval(syncTodayStart, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const updatedAtMsByNoteId = useMemo(() => {
    const map = new Map<string, number>();
    for (const note of notes) {
      map.set(note.id, new Date(note.updatedAt).getTime());
    }
    return map;
  }, [notes]);

  const folderChildrenMap = useMemo(() => {
    const map = new Map<string, Folder[]>();
    map.set(ROOT_FOLDER_KEY, []);
    for (const folder of folders) {
      const key = folder.parentId ?? ROOT_FOLDER_KEY;
      const bucket = map.get(key);
      if (bucket) {
        bucket.push(folder);
      } else {
        map.set(key, [folder]);
      }
    }
    return map;
  }, [folders]);

  const noteCountByFolderId = useMemo(() => {
    const map = new Map<string, number>();
    for (const note of notes) {
      if (note.trashed) continue;
      map.set(note.folderId, (map.get(note.folderId) || 0) + 1);
    }
    return map;
  }, [notes]);

  const handleContextMenuTrigger = React.useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    // Use viewport coordinates because the menu is fixed-position.
    setContextMenu({ id, x: e.clientX, y: e.clientY });
  }, []);

  const handleTrashContextMenu = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu(null);
    setTrashContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const notesById = useMemo(() => {
    const map = new Map<string, Note>();
    for (const note of notes) map.set(note.id, note);
    return map;
  }, [notes]);

  const contextMenuNote = React.useMemo(() => {
    if (!contextMenu?.id) return undefined;
    return notesById.get(contextMenu.id);
  }, [notesById, contextMenu?.id]);

  const infoNote = React.useMemo(() => {
    if (!infoNoteId) return null;
    return notesById.get(infoNoteId) || null;
  }, [notesById, infoNoteId]);
  const contextMenuPosition = React.useMemo(() => {
    if (!contextMenu) return null;
    const EDGE_GAP = 12;
    return {
      left: Math.max(EDGE_GAP, Math.min(contextMenu.x, window.innerWidth - contextMenuSize.width - EDGE_GAP)),
      top: Math.max(EDGE_GAP, Math.min(contextMenu.y, window.innerHeight - contextMenuSize.height - EDGE_GAP)),
    };
  }, [contextMenu, contextMenuSize.height, contextMenuSize.width]);
  const trashContextMenuPosition = React.useMemo(() => {
    if (!trashContextMenu) return null;
    const EDGE_GAP = 12;
    const MENU_W = 172;
    const MENU_H = 56;
    return {
      left: Math.max(EDGE_GAP, Math.min(trashContextMenu.x, window.innerWidth - MENU_W - EDGE_GAP)),
      top: Math.max(EDGE_GAP, Math.min(trashContextMenu.y, window.innerHeight - MENU_H - EDGE_GAP)),
    };
  }, [trashContextMenu]);

  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const rect = contextMenuRef.current.getBoundingClientRect();
    if (rect.width && rect.height) {
      setContextMenuSize({ width: rect.width, height: rect.height });
    }
  }, [contextMenu]);

  // Close context menu on external clicks
  useEffect(() => {
    const handleGlobalClick = () => {
      setContextMenu(null);
      setTrashContextMenu(null);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
        setTrashContextMenu(null);
        setInfoNoteId(null);
      }
    };
    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const formatInfoDate = React.useCallback((timestamp: string) => (
    new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(timestamp))
  ), []);

  const getTextStats = React.useCallback((note: Note) => {
    const content = note.content || '';
    const trimmed = content.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const characters = content.length;
    return { words, characters };
  }, []);

  const handleDeleteNote = (id: string, title?: string) => {
    deleteNote(id);
    addToast({
      type: 'info',
      message: `"${title || 'Untitled'}" moved to Trash`,
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: () => undoDeleteNote(id),
      },
    });
  };

  const handleRestoreNote = React.useCallback(async (id: string, title?: string) => {
    await restoreNote(id);
    addToast({
      type: 'success',
      message: `"${title || 'Untitled'}" restored`,
      duration: 2500,
    });
  }, [addToast, restoreNote]);

  const handlePermanentlyDeleteNote = React.useCallback(async (id: string, title?: string) => {
    const ok = window.confirm(`Permanently delete "${title || 'Untitled'}"? This cannot be undone.`);
    if (!ok) return;
    await permanentlyDeleteNote(id);
    addToast({
      type: 'success',
      message: `"${title || 'Untitled'}" permanently deleted`,
      duration: 3000,
    });
  }, [addToast, permanentlyDeleteNote]);

  // Get notes for the current view
  const visibleNotes = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const dayMs = 86400000;

    switch (activeSmartFolder) {
      case '__inbox':
        return notes.filter((n) => n.folderId === INBOX_FOLDER_ID && !n.trashed);
      case '__today':
        return notes.filter((n) => !n.trashed && (updatedAtMsByNoteId.get(n.id) || 0) > now - dayMs);
      case '__recent':
        return notes
          .filter((n) => !n.trashed)
          .sort((a, b) => (updatedAtMsByNoteId.get(b.id) || 0) - (updatedAtMsByNoteId.get(a.id) || 0))
          .slice(0, 20);
      case '__starred':
        return notes.filter((n) => n.starred && !n.trashed);
      case '__trash':
        return notes.filter((n) => n.trashed);
      default:
        return activeFolderId
          ? notes.filter((n) => n.folderId === activeFolderId && !n.trashed)
          : [];
    }
  }, [notes, activeSmartFolder, activeFolderId, updatedAtMsByNoteId]);

  const groupedVisibleNotes = useMemo(() => {
    const sortedNotes = [...visibleNotes].sort(
      (a, b) => (updatedAtMsByNoteId.get(b.id) || 0) - (updatedAtMsByNoteId.get(a.id) || 0)
    );

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const grouped: Array<{ label: string; notes: typeof sortedNotes }> = [];
    const groupedMap = new Map<string, typeof sortedNotes>();

    for (const note of sortedNotes) {
      const noteDateObj = new Date(updatedAtMsByNoteId.get(note.id) || 0);
      const noteDay = new Date(
        noteDateObj.getFullYear(),
        noteDateObj.getMonth(),
        noteDateObj.getDate()
      );

      let label = '';
      if (noteDay.getTime() === today.getTime()) {
        label = 'Today';
      } else if (noteDay.getTime() === yesterday.getTime()) {
        label = 'Yesterday';
      } else {
        label = noteDateObj.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
      }

      if (!groupedMap.has(label)) {
        const bucket: typeof sortedNotes = [];
        groupedMap.set(label, bucket);
        grouped.push({ label, notes: bucket });
      }
      groupedMap.get(label)?.push(note);
    }

    return grouped;
  }, [visibleNotes, updatedAtMsByNoteId]);

  const selectedNoteIdSet = useMemo(() => new Set(selectedNoteIds), [selectedNoteIds]);
  const visibleNoteIds = useMemo(() => visibleNotes.map((note) => note.id), [visibleNotes]);
  const visibleSelectedCount = useMemo(
    () => visibleNoteIds.reduce((count, id) => count + (selectedNoteIdSet.has(id) ? 1 : 0), 0),
    [visibleNoteIds, selectedNoteIdSet]
  );
  const allVisibleSelected = visibleNoteIds.length > 0 && visibleSelectedCount === visibleNoteIds.length;

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSmartFolderClick = (id: string) => {
    if (id === '__search') {
      setActiveSmartFolder(id);
      setActiveFolderId(null);
      setActiveSection('search');
      return;
    }
    setActiveSmartFolder(id);
    setActiveFolderId(null);
    if (id === '__inbox') {
      setActiveFolderId(INBOX_FOLDER_ID);
    }
  };

  const handleFolderClick = (id: string) => {
    setActiveSmartFolder(null);
    setActiveFolderId(id);
    toggleFolder(id);
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolder(newFolderName.trim());
      setNewFolderName('');
      setShowNewFolder(false);
    }
  };

  const handleNewNote = () => {
    const folderId = activeFolderId || INBOX_FOLDER_ID;
    createNote(folderId);
  };

  // Top-level folders (excluding Inbox which is handled as smart folder)
  const topFolders = useMemo(
    () => (folderChildrenMap.get(ROOT_FOLDER_KEY) || []).filter((f) => f.id !== INBOX_FOLDER_ID),
    [folderChildrenMap]
  );

  // Memoize smart folder counts to avoid recomputing on every render
  const smartFolderCounts = useMemo(() => {
    const counts: Record<string, number> = {
      '__inbox': 0,
      '__today': 0,
      '__starred': 0,
      '__trash': 0,
      '__search': 0,
      '__recent': 0,
    };

    for (const note of notes) {
      if (note.trashed) {
        counts.__trash += 1;
        continue;
      }
      if (note.folderId === INBOX_FOLDER_ID) counts.__inbox += 1;
      if (note.starred) counts.__starred += 1;
      if (todayStartMs && (updatedAtMsByNoteId.get(note.id) || 0) >= todayStartMs) counts.__today += 1;
    }

    return counts;
  }, [notes, updatedAtMsByNoteId, todayStartMs]);

  const trashedCount = smartFolderCounts['__trash'] || 0;

  const handleEmptyTrash = React.useCallback(async () => {
    if (trashedCount === 0) {
      addToast({ type: 'info', message: 'Trash is already empty', duration: 2200 });
      setTrashContextMenu(null);
      return;
    }
    const ok = window.confirm(`Permanently delete ${trashedCount} note${trashedCount === 1 ? '' : 's'} from Trash? This cannot be undone.`);
    if (!ok) {
      setTrashContextMenu(null);
      return;
    }
    const deleted = await emptyTrash();
    addToast({
      type: 'success',
      message: `Emptied Trash (${deleted} note${deleted === 1 ? '' : 's'})`,
      duration: 3000
    });
    setTrashContextMenu(null);
  }, [addToast, emptyTrash, trashedCount]);

  return (
    <aside className="sidebar acrylic animate-in">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-title">
          <span className="sidebar-logo">🍃</span>
          <span className="sidebar-wordmark">Leaf</span>
          {/* Native Streak Counter */}
          <div className={`sidebar-streak ${todayActive ? 'active-streak' : ''}`} title={`${streak} Day Streak`}>
            <Flame size={12} />
            <span>{streak}</span>
          </div>
        </div>

        <div className="sidebar-actions">
          <button className="sidebar-icon-btn" onClick={handleNewNote} title="New Note (⌘N)">
            <Plus size={16} />
          </button>
          <button className="sidebar-icon-btn" onClick={toggleCommandPalette} title="Search (⌘K)">
            <Search size={16} />
          </button>
        </div>
      </div>

      {/* Smart Folders */}
      <div className="sidebar-section animate-in delay-75">
        <div className="sidebar-section-label">SMART FOLDERS</div>
        {smartFolders.map((sf) => {
          const count = smartFolderCounts[sf.id] || 0;

          return (
            <button
              key={sf.id}
              className={`sidebar-item ${activeSmartFolder === sf.id ? 'active' : ''}`}
              onClick={() => handleSmartFolderClick(sf.id)}
              onContextMenu={sf.id === '__trash' ? handleTrashContextMenu : undefined}
            >
              <sf.icon size={15} style={{ color: sf.color }} />
              <span className="sidebar-item-label">{sf.label}</span>
              {count > 0 && (
                <span className="sidebar-item-badge">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Folders */}
      <div className="sidebar-section animate-in delay-150">
        <GettingStartedWidget notesCount={notes.length} foldersCount={folders.length} onDismiss={() => { }} />
        <div className="sidebar-section-label">
          MY FOLDERS
          <button
            className="sidebar-section-add"
            onClick={() => setShowNewFolder(true)}
            title="New Folder"
          >
            <FolderPlus size={14} />
          </button>
        </div>

        {showNewFolder && (
          <div className="sidebar-new-folder">
            <input
              autoFocus
              className="sidebar-new-folder-input"
              placeholder="Folder name..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') {
                  setShowNewFolder(false);
                  setNewFolderName('');
                }
              }}
              onBlur={() => {
                if (!newFolderName.trim()) {
                  setShowNewFolder(false);
                }
              }}
            />
          </div>
        )}

        {topFolders.map((folder) => (
          <FolderItem
            key={folder.id}
            folder={folder}
            folderChildrenMap={folderChildrenMap}
            noteCountByFolderId={noteCountByFolderId}
            expandedFolders={expandedFolders}
            activeFolderId={activeFolderId}
            activeSmartFolder={activeSmartFolder}
            toggleFolder={toggleFolder}
            handleFolderClick={handleFolderClick}
          />
        ))}
      </div>

      {/* Note list — always render with rich empty states */}
      <div className="sidebar-notes-section animate-in delay-300">
        <div className="sidebar-section-label">
          NOTES
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {visibleNotes.length > 0 && (
              <button
                className="sidebar-section-add"
                onClick={() => allVisibleSelected ? clearSelection() : selectAllNotes(visibleNoteIds)}
                style={{ opacity: 1, fontSize: '10px' }}
              >
                {allVisibleSelected ? 'DESELECT ALL' : 'SELECT ALL'}
              </button>
            )}
            {visibleNotes.length > 0 && (
              <span className="sidebar-section-count">{visibleNotes.length}</span>
            )}
          </div>
        </div>

        {visibleNotes.length === 0 ? (
          <div className="sidebar-empty-state">
            {activeSmartFolder === '__inbox' && (
              <>
                <div className="sidebar-empty-icon">✍️</div>
                <div className="sidebar-empty-title">Nothing here yet</div>
                <div className="sidebar-empty-desc">Your inbox is empty. Write your first thought.</div>
                <button className="sidebar-empty-cta" onClick={handleNewNote}>
                  <Plus size={14} /> New Note
                </button>
              </>
            )}
            {activeSmartFolder === '__today' && (
              <>
                <div className="sidebar-empty-icon">☀️</div>
                <div className="sidebar-empty-title">No activity today</div>
                <div className="sidebar-empty-desc">Notes you edit today will appear here.</div>
                <button className="sidebar-empty-cta" onClick={handleNewNote}>
                  <Plus size={14} /> Start writing
                </button>
              </>
            )}
            {activeSmartFolder === '__recent' && (
              <>
                <div className="sidebar-empty-icon">🕐</div>
                <div className="sidebar-empty-title">No recent notes</div>
                <div className="sidebar-empty-desc">Nothing edited in the last 24 hours.</div>
                <button className="sidebar-empty-cta" onClick={handleNewNote}>
                  <Plus size={14} /> New Note
                </button>
              </>
            )}
            {activeSmartFolder === '__starred' && (
              <>
                <div className="sidebar-empty-icon">⭐</div>
                <div className="sidebar-empty-title">No starred notes</div>
                <div className="sidebar-empty-desc">Star important notes to pin them here.</div>
              </>
            )}
            {activeSmartFolder === '__trash' && (
              <>
                <div className="sidebar-empty-icon">🎉</div>
                <div className="sidebar-empty-title">Trash is empty</div>
                <div className="sidebar-empty-desc">Deleted notes end up here. All clean!</div>
              </>
            )}
            {!activeSmartFolder && (
              <>
                <div className="sidebar-empty-icon">📂</div>
                <div className="sidebar-empty-title">Empty folder</div>
                <div className="sidebar-empty-desc">Add a note to get started.</div>
                <button className="sidebar-empty-cta" onClick={handleNewNote}>
                  <Plus size={14} /> New Note
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="sidebar-notes-list">
            {groupedVisibleNotes.map(({ label, notes: notesInGroup }) => (
              <div key={label} className="sidebar-date-group">
                <div className="sidebar-date-header">{label}</div>
                {notesInGroup.map((note) => {
                  const isSelected = selectedNoteIdSet.has(note.id);
                  return (
                    <NoteItem
                      key={note.id}
                      note={note}
                      isSelected={isSelected}
                      isActive={activeNoteId === note.id}
                      toggleNoteSelection={toggleNoteSelection}
                      setActiveNoteId={setActiveNoteId}
                      activeSmartFolder={activeSmartFolder}
                      handleDeleteNote={handleDeleteNote}
                      handleRestoreNote={handleRestoreNote}
                      handlePermanentlyDeleteNote={handlePermanentlyDeleteNote}
                      selectedCount={selectedNoteIds.length}
                      onContextMenuTrigger={handleContextMenuTrigger}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* Bulk Action Bar */}
        {selectedNoteIds.length > 0 && (
          <div className="bulk-action-bar">
            <div className="bulk-action-count">{selectedNoteIds.length} selected</div>
            <div className="bulk-action-actions">
              {activeSmartFolder === '__trash' && (
                <button
                  className="bulk-action-btn"
                  onClick={() => {
                    restoreSelectedNotes();
                    addToast({ type: 'success', message: `Restored ${selectedNoteIds.length} notes`, duration: 3000 });
                  }}
                  title="Restore Selected"
                >
                  <RotateCcw size={14} />
                </button>
              )}
              <button
                className="bulk-action-btn danger"
                onClick={() => {
                  if (activeSmartFolder === '__trash') {
                    const ok = window.confirm(`Permanently delete ${selectedNoteIds.length} notes? This cannot be undone.`);
                    if (!ok) return;
                  }
                  deleteSelectedNotes();
                  addToast({
                    type: 'success',
                    message: activeSmartFolder === '__trash'
                      ? `Permanently deleted ${selectedNoteIds.length} notes`
                      : `Moved ${selectedNoteIds.length} notes to Trash`,
                    duration: 3000
                  });
                }}
                title={activeSmartFolder === '__trash' ? "Permanently Delete Selected" : "Delete Selected"}
              >
                <Trash2 size={14} />
              </button>
              <button
                className="bulk-action-btn"
                onClick={() => clearSelection()}
                title="Cancel Selection"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .sidebar {
          width: var(--sidebar-width);
          min-width: var(--sidebar-width);
          max-width: 100%;
          height: 100%;
          border-radius: var(--radius-lg);
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          overflow-x: hidden;
        }

        /* Header */
        .sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 24px 20px 16px;
        }
        .sidebar-title {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .sidebar-logo { font-size: 18px; }
        .sidebar-wordmark {
          font-family: var(--font-display);
          font-size: 17px;
          font-weight: 600;
          color: var(--color-text-1);
          white-space: nowrap;
        }
        .sidebar-actions {
          display: flex;
          gap: 4px;
        }
        .sidebar-icon-btn {
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
        .sidebar-icon-btn:hover {
          background: var(--color-surface-2);
          color: var(--color-text-1);
        }

        /* Mobile Streak Counter */
        .sidebar-streak {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border-radius: var(--radius-full);
          background: var(--color-surface-2);
          color: var(--color-text-3);
          font-size: 11px;
          font-weight: 700;
          font-family: var(--font-ui);
          margin-left: 4px;
        }
        .sidebar-streak.active-streak {
          color: #ff9800;
          background: rgba(255, 152, 0, 0.08);
          border: 1px solid rgba(255, 152, 0, 0.15);
        }
        .sidebar-streak.active-streak svg {
          filter: drop-shadow(0 0 6px rgba(255, 152, 0, 0.4));
        }

        /* Streak visibility: No longer hidden on desktop */

        /* Sections */
        .sidebar-section {
          padding: 12px 8px 4px;
          margin-bottom: 8px;
        }
        .sidebar-section-label {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--color-text-4);
          padding: 8px 4px 6px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .sidebar-section-add {
          border: none;
          background: transparent;
          color: var(--color-text-4);
          cursor: pointer;
          padding: 2px;
          border-radius: var(--radius-sm);
          opacity: 0;
          transition: opacity var(--dur-fast), color var(--dur-fast), background-color var(--dur-fast);
        }
        .sidebar-section:hover .sidebar-section-add {
          opacity: 1;
        }
        .sidebar-section-add:hover {
          color: var(--color-accent);
          background: var(--color-accent-light);
        }
        .sidebar-section-count {
          font-size: var(--text-xs);
          color: var(--color-text-4);
          font-weight: 400;
        }

        /* Items */
        .sidebar-item {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 6px 8px;
          border: none;
          background: transparent;
          color: var(--color-text-2);
          border-radius: var(--radius-md);
          cursor: pointer;
          font-size: var(--text-sm);
          font-family: var(--font-ui);
          text-align: left;
          transition: background-color var(--dur-fast) var(--spring-snappy), color var(--dur-fast) var(--spring-snappy);
          will-change: background-color;
        }
        .sidebar-item:hover {
          background: var(--color-surface-2);
        }
        .sidebar-item.active {
          background: var(--color-surface-3);
          color: var(--color-text-1);
          font-weight: 500;
        }
        .sidebar-item-label { flex: 1; }
        .sidebar-item-badge {
          font-size: var(--text-xs);
          color: var(--color-text-4);
          min-width: 16px;
          text-align: right;
        }

        /* Folder item */
        .sidebar-folder-chevron {
          color: var(--color-text-4);
          transition: transform var(--dur-fast) var(--spring-snappy);
          flex-shrink: 0;
        }
        .sidebar-folder-chevron.expanded {
          transform: rotate(90deg);
        }
        .sidebar-folder-children {
          overflow: hidden;
          transition: max-height var(--dur-normal) var(--spring-smooth);
        }

        /* New folder input */
        .sidebar-new-folder {
          padding: 2px 4px;
        }
        .sidebar-new-folder-input {
          width: 100%;
          padding: 5px 8px;
          border: 1.5px solid var(--color-accent);
          border-radius: var(--radius-sm);
          background: var(--color-surface);
          color: var(--color-text-1);
          font-size: var(--text-sm);
          font-family: var(--font-ui);
          outline: none;
        }

        /* Notes section */
        .sidebar-notes-section {
          position: relative;
          padding: 4px 8px;
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
        .sidebar-notes-section > .sidebar-section-label {
          margin-bottom: 6px;
        }
        .sidebar-notes-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 4px;
          content-visibility: auto;
          contain-intrinsic-size: auto 500px;
          padding-top: 14px;
          padding-bottom: 72px; /* Extra room so floating bar doesn't obscure last item */
          scroll-padding-top: 14px;
        }
        .sidebar-date-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-top: 14px;
        }
        .sidebar-date-group:first-child {
          margin-top: 0;
        }
        .sidebar-date-header {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--color-text-4);
          padding: 8px 12px 6px;
          line-height: 1.25;
        }
        .sidebar-note {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          width: 100%;
          padding: 8px 8px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--color-text-2);
          border-radius: var(--radius-md);
          cursor: pointer;
          text-align: left;
          font-family: var(--font-ui);
          transition: background var(--dur-fast), border-color var(--dur-fast), padding 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .sidebar-note:hover {
          background: var(--color-surface-2);
        }
        .sidebar-note.active {
          background: var(--color-surface-3);
        }
        .sidebar-note-icon {
          color: var(--color-text-4);
          margin-top: 2px;
          flex-shrink: 0;
        }
        .sidebar-note-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .sidebar-note-title {
          font-size: var(--text-sm);
          font-weight: 500;
          color: var(--color-text-1);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .sidebar-note-meta {
          font-size: var(--text-xs);
          color: var(--color-text-3);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Note wrapper with hover-reveal actions */
        .sidebar-note-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        .sidebar-note-wrapper .sidebar-note {
          flex: 1;
          min-width: 0;
          padding-right: 28px;
        }
        .sidebar-note.is-trash-view {
          padding-right: 54px;
        }
        .sidebar-note-actions {
          position: absolute;
          right: 4px;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          align-items: center;
          gap: 2px;
          opacity: 0;
          transition: opacity var(--dur-fast);
        }
        .sidebar-note-wrapper:hover .sidebar-note-actions {
          opacity: 1;
        }
        .sidebar-note-action {
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: transparent;
          color: var(--color-text-4);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: color var(--dur-fast), background var(--dur-fast);
        }
        .sidebar-note-action:hover {
          color: var(--color-text-2);
          background: var(--color-surface-2);
        }
        .sidebar-note-action.danger:hover {
          color: var(--color-red);
          background: var(--color-red-light);
        }

        /* Bulk Selection Checkbox */
        .sidebar-note-checkbox {
          width: 0;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: transparent;
          color: var(--color-text-4);
          cursor: pointer;
          opacity: 0;
          overflow: hidden;
          flex-shrink: 0;
          transition: width var(--dur-fast), opacity var(--dur-fast), color var(--dur-fast);
        }
        .sidebar-note-wrapper:hover .sidebar-note-checkbox,
        .sidebar-note-checkbox.visible,
        .sidebar-note-checkbox.checked {
          opacity: 1;
          width: 24px;
          margin-right: 8px;
        }
        .sidebar-note-checkbox:hover {
          color: var(--color-text-2);
        }
        .sidebar-note-checkbox.checked {
          color: var(--color-accent);
        }

        .sidebar-note-wrapper.selected .sidebar-note {
          background: var(--color-surface-2);
          border: 1px solid var(--color-accent-light);
        }

        /* Bulk Action Bar - Premium Floating Glass Pill */
        .bulk-action-bar {
          position: absolute;
          bottom: 16px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(20, 20, 20, 0.85);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.08);
          border-radius: 40px;
          padding: 6px 8px 6px 16px;
          display: flex;
          align-items: center;
          gap: 14px;
          z-index: 100;
          animation: slide-up-pill 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        
        @keyframes slide-up-pill {
          from { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
        
        .bulk-action-count {
          font-size: 13px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.95);
          font-family: var(--font-ui);
          white-space: nowrap;
        }
        
        .bulk-action-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .bulk-action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: var(--radius-full);
          border: none;
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.7);
          cursor: pointer;
          transition: background-color var(--dur-fast), color var(--dur-fast), transform var(--dur-fast);
        }
        
        .bulk-action-btn:hover {
          background: rgba(255, 255, 255, 0.15);
          color: rgba(255, 255, 255, 1);
          transform: scale(1.05);
        }
        
        .bulk-action-btn.danger {
          color: #ff6b6b;
          background: rgba(255, 107, 107, 0.15);
        }
        
        .bulk-action-btn.danger:hover {
          background: rgba(255, 107, 107, 0.25);
          color: #ff8787;
        }

        /* Empty states */
        .sidebar-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 32px 16px;
          gap: 8px;
          text-align: center;
          flex: 1;
        }
        .sidebar-empty-icon {
          font-size: 32px;
          margin-bottom: 4px;
          filter: saturate(0.8);
        }
        .sidebar-empty-title {
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--color-text-2);
          font-family: var(--font-ui);
        }
        .sidebar-empty-desc {
          font-size: var(--text-xs);
          color: var(--color-text-4);
          line-height: 1.5;
          max-width: 180px;
        }
        .sidebar-empty-cta {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          margin-top: 8px;
          padding: 6px 14px;
          background: var(--color-accent-light);
          color: var(--color-accent);
          border: 1px solid var(--color-accent);
          border-radius: var(--radius-full);
          font-size: var(--text-xs);
          font-weight: 600;
          font-family: var(--font-ui);
          cursor: pointer;
          transition: background-color var(--dur-fast), color var(--dur-fast), transform var(--dur-fast), box-shadow var(--dur-fast), border-color var(--dur-fast);
        }
        .sidebar-empty-cta:hover {
          background: var(--color-accent);
          color: white;
        }

        /* Onboarding Widget: Floating Luxury Card */
        .onboarding-widget {
          margin: 12px;
          padding: 20px;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-md);
          position: relative;
          z-index: 10;
        }
        .onboarding-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .onboarding-header h5 {
          margin: 0;
          font-family: var(--font-display);
          font-size: 19px;
          font-weight: 500;
          color: var(--color-text-1);
          letter-spacing: -0.01em;
          font-style: italic;
        }
        .onboarding-close {
          background: transparent;
          border: none;
          color: var(--color-text-4);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 6px;
          border-radius: var(--radius-full);
          transition: background-color var(--dur-fast), color var(--dur-fast), transform var(--dur-fast);
        }
        .onboarding-close:hover {
          background: var(--color-accent-light);
          color: var(--color-accent);
        }
        .onboarding-progress-bar {
          height: 4px;
          background: var(--color-surface-3);
          border-radius: var(--radius-full);
          margin-bottom: 20px;
          overflow: hidden;
        }
        .onboarding-progress-fill {
          height: 100%;
          background: var(--color-accent);
          border-radius: var(--radius-full);
          transition: width 0.8s var(--spring-smooth);
        }
        .onboarding-steps {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .onboarding-steps li {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 13.5px;
          color: var(--color-text-2);
          font-family: var(--font-ui);
          transition: opacity var(--dur-fast);
        }
        .step-check {
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-4);
          flex-shrink: 0;
        }
        .completed .step-check {
          color: var(--color-accent);
        }
        .onboarding-steps li.completed span {
          color: var(--color-text-4);
          text-decoration: line-through;
          opacity: 0.6;
        }
        .onboarding-success {
          margin-top: 18px;
          padding-top: 16px;
          border-top: 1px solid var(--color-border);
          font-size: 12px;
          color: var(--color-text-2);
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-weight: 500;
        }
        .onboarding-success button {
          background: var(--color-accent);
          border: none;
          color: white;
          cursor: pointer;
          font-size: 11px;
          font-weight: 600;
          padding: 5px 14px;
          border-radius: var(--radius-full);
          transition: transform var(--dur-fast), box-shadow var(--dur-fast), background-color var(--dur-fast);
          box-shadow: 0 4px 12px var(--color-accent-light);
        }
        .onboarding-success button:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px var(--color-accent-light);
        }

        .sidebar-header-right {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        .context-menu {
          position: fixed;
          z-index: 99999;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-lg);
          padding: 4px;
          min-width: 150px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
          -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
        }

        .context-menu-item {
          padding: 8px 12px;
          text-align: left;
          border-radius: 6px;
          font-size: 13px;
          background: transparent;
          border: none;
          color: var(--color-text-2);
          cursor: pointer;
          transition: background-color var(--dur-fast), color var(--dur-fast);
        }

        .context-menu-item:hover {
          background: var(--color-surface-3);
        }

        .context-menu-item.danger {
          color: var(--color-red);
        }

        .context-menu-item.danger:hover {
          background: var(--color-red-light);
        }

        .context-menu-item:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .note-info-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100000;
          background: rgba(0, 0, 0, 0.35);
          backdrop-filter: blur(var(--glass-blur));
          -webkit-backdrop-filter: blur(var(--glass-blur));
          display: grid;
          place-items: center;
          padding: 20px;
        }

        .note-info-modal {
          width: min(460px, calc(100vw - 32px));
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-xl);
          backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
          -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .note-info-title {
          font-family: var(--font-serif);
          font-size: 24px;
          color: var(--color-text-1);
          margin: 0;
          line-height: 1.2;
        }

        .note-info-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }

        .note-info-row {
          display: grid;
          grid-template-columns: 120px 1fr;
          gap: 10px;
          align-items: start;
          font-size: 14px;
        }

        .note-info-label {
          color: var(--color-text-4);
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          font-size: 11px;
        }

        .note-info-value {
          color: var(--color-text-2);
          line-height: 1.5;
          word-break: break-word;
        }

        .note-info-actions {
          display: flex;
          justify-content: flex-end;
        }

        .note-info-close {
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-surface-2);
          color: var(--color-text-2);
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          padding: 7px 12px;
          transition: background-color var(--dur-fast), color var(--dur-fast), border-color var(--dur-fast);
        }

        .note-info-close:hover {
          background: var(--color-surface-3);
          color: var(--color-text-1);
          border-color: var(--color-border-strong);
        }

        @media (max-width: 1200px) {
          .sidebar {
            width: clamp(250px, 30vw, 300px);
            min-width: clamp(250px, 30vw, 300px);
          }
        }

        @media (max-width: 1024px) {
          .sidebar {
            width: 100%;
            min-width: 0;
            border-radius: 0 var(--radius-lg) var(--radius-lg) 0;
          }
          .sidebar-header {
            padding: 18px 16px 14px;
          }
          .sidebar-wordmark {
            font-size: 16px;
          }
          .sidebar-section {
            padding: 10px 8px 2px;
          }
          .onboarding-widget {
            margin: 10px;
            padding: 16px;
          }
          .sidebar-empty-state {
            padding: 28px 14px;
          }
          .sidebar-empty-desc {
            max-width: 220px;
          }
        }

        @media (max-width: 640px) {
          .sidebar-notes-section {
            padding-inline: 6px;
          }
          .sidebar-notes-section > .sidebar-section-label {
            gap: 10px;
            align-items: flex-start;
          }
          .sidebar-notes-section > .sidebar-section-label > div {
            flex-shrink: 0;
            gap: 6px !important;
          }
          .sidebar-note-wrapper {
            display: grid;
            grid-template-columns: auto minmax(0, 1fr) auto;
            align-items: center;
            gap: 8px;
          }
          .sidebar-note-wrapper .sidebar-note {
            padding-right: 10px;
          }
          .sidebar-note.is-trash-view {
            padding-right: 10px;
          }
          .sidebar-note-actions {
            position: static;
            transform: none;
            opacity: 1;
            flex-shrink: 0;
            gap: 4px;
          }
          .sidebar-note-checkbox.visible,
          .sidebar-note-checkbox.checked {
            width: 22px;
            margin-right: 0;
          }
          .sidebar-note-title,
          .sidebar-note-meta {
            max-width: 100%;
          }
          .sidebar-header {
            padding: 16px 14px 12px;
          }
          .sidebar-title {
            gap: 8px;
          }
          .sidebar-wordmark {
            font-size: 15px;
          }
          .sidebar-streak {
            padding: 4px 8px;
            font-size: 10px;
          }
          .sidebar-actions {
            gap: 2px;
          }
          .sidebar-icon-btn {
            width: 30px;
            height: 30px;
          }
          .sidebar-section-label {
            font-size: 9px;
            letter-spacing: 0.14em;
          }
          .sidebar-item {
            padding: 8px 8px;
          }
          .onboarding-header h5 {
            font-size: 17px;
          }
          .onboarding-steps li {
            font-size: 13px;
          }
          .sidebar-empty-title {
            font-size: 15px;
          }
          .sidebar-empty-desc {
            max-width: 240px;
          }
        }

        @media (max-width: 480px) {
          .sidebar-section-label {
            font-size: 9px;
            letter-spacing: 0.11em;
          }
          .sidebar-notes-list {
            padding-top: 10px;
          }
          .sidebar-date-header {
            padding: 6px 10px 4px;
          }
          .sidebar-note {
            gap: 6px;
            padding: 8px 6px;
          }
          .sidebar-note-wrapper {
            gap: 6px;
          }
          .sidebar-note-action {
            width: 24px;
            height: 24px;
          }
          .sidebar-note-checkbox.visible,
          .sidebar-note-checkbox.checked {
            width: 20px;
          }
          .sidebar-header-right {
            gap: 6px;
          }
          .sidebar-wordmark {
            font-size: 14px;
          }
          .sidebar-streak {
            margin-left: 0;
          }
          .onboarding-widget {
            margin: 8px;
            padding: 14px;
          }
          .onboarding-success {
            align-items: flex-start;
            flex-direction: column;
            gap: 10px;
          }
          .sidebar-empty-state {
            padding: 24px 12px;
          }
          .sidebar-empty-cta {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>

      {contextMenuNote && contextMenu && contextMenuPosition && createPortal(
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{
            left: contextMenuPosition.left,
            top: contextMenuPosition.top,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="context-menu-item"
            onClick={() => { toggleNoteSelection(contextMenuNote.id); setContextMenu(null); }}
          >
            Select
          </button>
          <button
            className="context-menu-item"
            onClick={() => { setInfoNoteId(contextMenuNote.id); setContextMenu(null); }}
          >
            Info
          </button>
          {contextMenuNote.trashed ? (
            <>
              <button
                className="context-menu-item"
                onClick={() => { void handleRestoreNote(contextMenuNote.id, contextMenuNote.title); setContextMenu(null); }}
              >
                Restore
              </button>
              <button
                className="context-menu-item danger"
                onClick={() => { void handlePermanentlyDeleteNote(contextMenuNote.id, contextMenuNote.title); setContextMenu(null); }}
              >
                Delete Permanently
              </button>
            </>
          ) : (
            <button
              className="context-menu-item danger"
              onClick={() => { handleDeleteNote(contextMenuNote.id, contextMenuNote.title); setContextMenu(null); }}
            >
              Delete
            </button>
          )}
        </div>,
        document.body
      )}

      {trashContextMenu && trashContextMenuPosition && createPortal(
        <div
          className="context-menu"
          style={{
            left: trashContextMenuPosition.left,
            top: trashContextMenuPosition.top,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="context-menu-item danger"
            onClick={handleEmptyTrash}
            disabled={trashedCount === 0}
          >
            Empty Trash
          </button>
        </div>,
        document.body
      )}

      {infoNote && createPortal(
        <div className="note-info-backdrop" onClick={() => setInfoNoteId(null)}>
          <div className="note-info-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="note-info-title">{infoNote.title || 'Untitled'}</h3>
            <div className="note-info-grid">
              <div className="note-info-row">
                <div className="note-info-label">File Name</div>
                <div className="note-info-value">{infoNote.title || 'Untitled'}</div>
              </div>
              <div className="note-info-row">
                <div className="note-info-label">Created</div>
                <div className="note-info-value">{formatInfoDate(infoNote.createdAt)}</div>
              </div>
              <div className="note-info-row">
                <div className="note-info-label">Modified</div>
                <div className="note-info-value">{formatInfoDate(infoNote.updatedAt)}</div>
              </div>
              <div className="note-info-row">
                <div className="note-info-label">Total Words</div>
                <div className="note-info-value">{getTextStats(infoNote).words}</div>
              </div>
              <div className="note-info-row">
                <div className="note-info-label">Characters</div>
                <div className="note-info-value">{getTextStats(infoNote).characters}</div>
              </div>
            </div>
            <div className="note-info-actions">
              <button className="note-info-close" onClick={() => setInfoNoteId(null)}>Close</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </aside>
  );
}

// ─── Memoized Note Item ───
const NoteItem = React.memo(({
  note,
  isSelected,
  isActive,
  toggleNoteSelection,
  setActiveNoteId,
  activeSmartFolder,
  handleDeleteNote,
  handleRestoreNote,
  handlePermanentlyDeleteNote,
  selectedCount,
  onContextMenuTrigger
}: {
  note: Note;
  isSelected: boolean;
  isActive: boolean;
  toggleNoteSelection: (id: string) => void;
  setActiveNoteId: (id: string) => void;
  activeSmartFolder: string | null;
  handleDeleteNote: (id: string, title?: string) => void;
  handleRestoreNote: (id: string, title?: string) => void;
  handlePermanentlyDeleteNote: (id: string, title?: string) => void;
  selectedCount: number;
  onContextMenuTrigger: (e: React.MouseEvent, id: string) => void;
}) => {
  const isTrashView = activeSmartFolder === '__trash';
  const preview = useMemo(() => extractPreviewText(note.content, 40), [note.content]);
  const updatedAtMs = useMemo(() => new Date(note.updatedAt).getTime(), [note.updatedAt]);
  const contextualTime = useMemo(() => formatContextualTime(note), [note]);

  return (
    <div className={`sidebar-note-wrapper ${isSelected ? 'selected' : ''}`}>
      <button
        className={`sidebar-note-checkbox ${isSelected ? 'checked' : ''} ${selectedCount > 0 ? 'visible' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          toggleNoteSelection(note.id);
        }}
      >
        {isSelected ? <CheckSquare size={14} className="text-accent" /> : <Square size={14} />}
      </button>
      <button
        className={`sidebar-note ${isActive ? 'active' : ''} ${isTrashView ? 'is-trash-view' : ''}`}
        draggable={true}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', `[[${note.title || 'Untitled'}]]`);
          e.dataTransfer.setData('application/x-leaf-note-id', note.id);
          e.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={() => setActiveNoteId(note.id)}
        onContextMenu={(e) => onContextMenuTrigger(e, note.id)}
      >
        <FileText size={13} className="sidebar-note-icon" />
        <div className="sidebar-note-info">
          <span className="sidebar-note-title">
            {note.title || 'Untitled'}
          </span>
          <span className="sidebar-note-meta" title={formatExactTime(updatedAtMs)}>
            {contextualTime}
            {preview ? ` · ${preview}` : ''}
          </span>
        </div>
        {note.starred && (
          <div style={{ display: 'flex', height: '20px', alignItems: 'center', flexShrink: 0 }}>
            <Star size={12} fill="var(--color-amber)" color="var(--color-amber)" />
          </div>
        )}
      </button>
      <div className="sidebar-note-actions">
        {isTrashView ? (
          <>
            <button
              className="sidebar-note-action"
              title="Restore"
              onClick={(e) => {
                e.stopPropagation();
                void handleRestoreNote(note.id, note.title);
              }}
            >
              <RotateCcw size={12} />
            </button>
            <button
              className="sidebar-note-action danger"
              title="Delete permanently"
              onClick={(e) => {
                e.stopPropagation();
                void handlePermanentlyDeleteNote(note.id, note.title);
              }}
            >
              <Trash2 size={12} />
            </button>
          </>
        ) : (
          <button
            className="sidebar-note-action danger"
            title="Move to Trash"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteNote(note.id, note.title);
            }}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

    </div>
  );
}, (prev, next) => {
  // Only re-render if fundamental props changed
  return (
    prev.note.id === next.note.id &&
    prev.note.title === next.note.title &&
    prev.note.updatedAt === next.note.updatedAt &&
    prev.note.content === next.note.content &&
    prev.note.priority === next.note.priority &&
    prev.note.starred === next.note.starred &&
    prev.isSelected === next.isSelected &&
    prev.isActive === next.isActive &&
    prev.activeSmartFolder === next.activeSmartFolder &&
    (prev.selectedCount > 0) === (next.selectedCount > 0)
  );
});

/* ─── Folder Sub-Component ─── */
const FolderItem = React.memo(function FolderItem({
  folder,
  folderChildrenMap,
  noteCountByFolderId,
  expandedFolders,
  activeFolderId,
  activeSmartFolder,
  toggleFolder,
  handleFolderClick,
}: {
  folder: Folder;
  folderChildrenMap: Map<string, Folder[]>;
  noteCountByFolderId: Map<string, number>;
  expandedFolders: Set<string>;
  activeFolderId: string | null;
  activeSmartFolder: string | null;
  toggleFolder: (id: string) => void;
  handleFolderClick: (id: string) => void;
}) {
  const isExpanded = expandedFolders.has(folder.id);
  const children = folderChildrenMap.get(folder.id) || [];
  const noteCount = noteCountByFolderId.get(folder.id) || 0;

  return (
    <div>
      <button
        className={`sidebar-item ${!activeSmartFolder && activeFolderId === folder.id ? 'active' : ''
          }`}
        onClick={() => handleFolderClick(folder.id)}
      >
        <ChevronRight
          size={12}
          className={`sidebar-folder-chevron ${isExpanded ? 'expanded' : ''}`}
        />
        <span>{folder.icon || '📁'}</span>
        <span className="sidebar-item-label">{folder.name}</span>
        {noteCount > 0 && (
          <span className="sidebar-item-badge">{noteCount}</span>
        )}
      </button>

      {isExpanded && children.length > 0 && (
        <div style={{ paddingLeft: 16 }}>
          {children.map((c) => (
            <FolderItem
              key={c.id}
              folder={c}
              folderChildrenMap={folderChildrenMap}
              noteCountByFolderId={noteCountByFolderId}
              expandedFolders={expandedFolders}
              activeFolderId={activeFolderId}
              activeSmartFolder={activeSmartFolder}
              toggleFolder={toggleFolder}
              handleFolderClick={handleFolderClick}
            />
          ))}
        </div>
      )}
    </div>
  );
});
