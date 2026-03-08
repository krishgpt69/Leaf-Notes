import { create } from 'zustand';
import { db, type Note, type Folder, INBOX_FOLDER_ID, initializeDefaultData, logDailyActivity, getStreakData } from './db';
import { v4 as uuid } from 'uuid';
import { extractTags, extractLinks, extractTitle, countWords } from './utils';
import { trackNoteOpen, trackNoteEdit } from './activity-tracker';

let activityLogTimer: ReturnType<typeof setTimeout> | null = null;

/* ═══════════════════════════════════════════════════════════════
   🍃 Leaf Store — Zustand
   ═══════════════════════════════════════════════════════════════ */
export type ViewSection = 'notes' | 'search' | 'tags' | 'import' | 'stickers' | 'settings' | 'intelligence';
export type ViewMode = 'raw' | 'preview';
const MIN_EDITOR_FONT_SIZE = 14;
const MAX_EDITOR_FONT_SIZE = 18;
const MIN_EDITOR_LINE_HEIGHT = 0.75;
const MAX_EDITOR_LINE_HEIGHT = 2.5;
const DEFAULT_EDITOR_FONT_SIZE = 16;
const DEFAULT_EDITOR_LINE_HEIGHT = 1.75;
const DEFAULT_EDITOR_CONTENT_WIDTH = 680;
export type HistoryAction =
    | { type: 'NOTE_CREATED', noteId: string }
    | { type: 'NOTE_DELETED', noteId: string }
    | { type: 'NOTES_BULK_DELETED', noteIds: string[] }
    | { type: 'NOTE_UPDATED', noteId: string, prev: Partial<Note>, next: Partial<Note> };

export interface LeafState {
    // Data
    notes: Note[];
    folders: Folder[];

    // Navigation
    activeSection: ViewSection;
    activeFolderId: string | null;
    activeNoteId: string | null;
    openNoteIds: string[];

    // Selection state
    selectedNoteIds: string[];

    // UI state
    theme: 'light' | 'dark' | 'system';
    resolvedTheme: 'light' | 'dark';
    accentColor: string;
    sidebarVisible: boolean;
    commandPaletteOpen: boolean;
    focusMode: boolean;
    isDocumentMode: boolean;
    lastViewMode: ViewMode;
    lastViewModeAt: number;
    viewModeByNoteId: Record<string, ViewMode>;
    monochromeMode: boolean;
    editorFontSize: number;
    editorLineHeight: number;
    editorContentWidth: number;

    // Search
    searchQuery: string;

    // Activity
    streak: number;
    todayActive: boolean;

    // Loading
    initialized: boolean;

    // History
    pastActions: HistoryAction[];
    futureActions: HistoryAction[];

    // Actions
    initialize: () => Promise<void>;
    setActiveSection: (s: ViewSection) => void;
    setActiveFolderId: (id: string | null) => void;
    setActiveNoteId: (id: string | null) => void;
    closeNoteTab: (id: string) => void;
    toggleSidebar: () => void;
    toggleCommandPalette: () => void;
    toggleFocusMode: () => void;
    toggleIsDocumentMode: () => void;
    setViewMode: (mode: ViewMode, noteId?: string | null) => void;
    toggleMonochromeMode: () => void;
    setEditorFontSize: (size: number) => void;
    setEditorLineHeight: (lineHeight: number) => void;
    setEditorContentWidth: (width: number) => void;
    resetEditorPreferences: () => void;
    setTheme: (t: 'light' | 'dark' | 'system') => void;
    setResolvedTheme: (t: 'light' | 'dark') => void;
    setAccentColor: (color: string) => void;
    setSearchQuery: (q: string) => void;

    // Note actions
    createNote: (folderId?: string) => Promise<Note>;
    updateNote: (id: string, updates: Partial<Note>) => Promise<void>;
    deleteNote: (id: string) => Promise<void>;
    undoDeleteNote: (id: string) => Promise<void>;
    restoreNote: (id: string) => Promise<void>;
    permanentlyDeleteNote: (id: string) => Promise<void>;
    emptyTrash: () => Promise<number>;
    starNote: (id: string) => Promise<void>;

    // Bulk actions
    toggleNoteSelection: (id: string) => void;
    clearSelection: () => void;
    selectAllNotes: (ids: string[]) => void;
    deleteSelectedNotes: () => Promise<void>;
    restoreSelectedNotes: () => Promise<void>;
    moveSelectedNotes: (folderId: string) => Promise<void>;

    // Folder actions
    createFolder: (name: string, parentId?: string | null) => Promise<Folder>;
    updateFolder: (id: string, updates: Partial<Folder>) => Promise<void>;
    deleteFolder: (id: string) => Promise<void>;

    // History Actions
    undo: () => Promise<void>;
    redo: () => Promise<void>;

    // Data refresh
    refreshNotes: () => Promise<void>;
    refreshFolders: () => Promise<void>;
    refreshStreak: () => Promise<void>;
}

export const useStore = create<LeafState>((set, get) => ({
    notes: [],
    folders: [],
    activeSection: 'notes',
    activeFolderId: INBOX_FOLDER_ID,
    activeNoteId: null,
    openNoteIds: [],
    selectedNoteIds: [],
    theme: 'system',
    resolvedTheme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    accentColor: 'hsl(142 71% 45%)', // Default leaf green
    sidebarVisible: true,
    commandPaletteOpen: false,
    focusMode: false,
    viewModeByNoteId: JSON.parse(localStorage.getItem('leaf-view-mode-by-note') || '{}') as Record<string, ViewMode>,
    isDocumentMode: (localStorage.getItem('leaf-view-mode') as ViewMode | null) === 'preview',
    lastViewMode: (localStorage.getItem('leaf-view-mode') as ViewMode | null) || 'raw',
    lastViewModeAt: Number(localStorage.getItem('leaf-view-mode-at') || 0),
    monochromeMode: JSON.parse(localStorage.getItem('leaf-monochrome') || 'false'),
    editorFontSize: readStoredNumber('leaf-editor-font-size', DEFAULT_EDITOR_FONT_SIZE, MIN_EDITOR_FONT_SIZE, MAX_EDITOR_FONT_SIZE),
    editorLineHeight: readStoredNumber('leaf-editor-line-height', DEFAULT_EDITOR_LINE_HEIGHT, MIN_EDITOR_LINE_HEIGHT, MAX_EDITOR_LINE_HEIGHT),
    editorContentWidth: readStoredNumber('leaf-editor-content-width', DEFAULT_EDITOR_CONTENT_WIDTH, 480, 1600),
    searchQuery: '',
    streak: 0,
    todayActive: false,
    initialized: false,
    pastActions: [],
    futureActions: [],

    initialize: async () => {
        await initializeDefaultData();
        // Handle auto-migration for note timestamps to ISO strings
        const rawNotes = await db.notes.toArray();
        const migrations: Note[] = [];
        const notes = rawNotes.map(n => {
            let needsMigration = false;
            const legacy = n as Note & { modifiedAt?: string | number };
            let { createdAt, updatedAt } = legacy;
            const { modifiedAt } = legacy;

            if (!createdAt || typeof createdAt === 'number') {
                createdAt = createdAt ? new Date(createdAt).toISOString() : new Date().toISOString();
                needsMigration = true;
            }

            if (!updatedAt) {
                if (modifiedAt) {
                    updatedAt = typeof modifiedAt === 'number' ? new Date(modifiedAt).toISOString() : modifiedAt;
                } else {
                    updatedAt = createdAt;
                }
                needsMigration = true;
            } else if (typeof updatedAt === 'number') {
                updatedAt = new Date(updatedAt).toISOString();
                needsMigration = true;
            }

            const migratedNote: Note & { modifiedAt?: string | number } = { ...n, createdAt, updatedAt };
            delete migratedNote.modifiedAt;

            if (needsMigration) {
                migrations.push(migratedNote as Note);
            }
            return migratedNote as Note;
        });

        if (migrations.length > 0) {
            await db.notes.bulkPut(migrations);
        }

        const folders = await db.folders.orderBy('sortOrder').toArray();
        const streakData = await getStreakData();

        // Load theme from settings
        const themeSetting = await db.settings.get('theme');
        const theme = (themeSetting?.value as 'light' | 'dark' | 'system') || (localStorage.getItem('theme') as 'light' | 'dark' | 'system') || 'system';
        const resolvedTheme = resolveTheme(theme);

        // Load accent color
        const accentSetting = await db.settings.get('accentColor');
        const accentColor = (accentSetting?.value as string) || 'hsl(142 71% 45%)';

        const fontSizeSetting = await db.settings.get('editorFontSize');
        const lineHeightSetting = await db.settings.get('editorLineHeight');
        const contentWidthSetting = await db.settings.get('editorContentWidth');
        const editorFontSize = normalizeEditorFontSize(fontSizeSetting?.value ?? localStorage.getItem('leaf-editor-font-size'));
        const editorLineHeight = normalizeEditorLineHeight(lineHeightSetting?.value ?? localStorage.getItem('leaf-editor-line-height'));
        const editorContentWidth = normalizeEditorContentWidth(contentWidthSetting?.value ?? localStorage.getItem('leaf-editor-content-width'));

        set({
            notes,
            folders,
            theme,
            resolvedTheme,
            accentColor,
            streak: streakData.streak,
            todayActive: streakData.todayActive,
            editorFontSize,
            editorLineHeight,
            editorContentWidth,
            initialized: true
        });
        applyTheme(theme, accentColor);
        applyEditorPreferences(editorFontSize, editorLineHeight, editorContentWidth);
        localStorage.setItem('theme', theme);
    },

    setActiveSection: (s) => set({ activeSection: s, ...(s !== 'notes' ? { activeNoteId: null } : {}) }),
    setActiveFolderId: (id) => set({ activeFolderId: id, selectedNoteIds: [] }),
    setActiveNoteId: (id) => {
        // Track note open for intelligence features
        if (id) {
            const note = get().notes.find(n => n.id === id);
            if (note) trackNoteOpen(id, note.wordCount || 0);
        }
        set((s) => ({
            activeNoteId: id,
            ...(id ? { activeSection: 'notes' as const } : {}),
            openNoteIds: id && !s.openNoteIds.includes(id) ? [...s.openNoteIds, id] : s.openNoteIds,
        }));
    },
    closeNoteTab: (id) => set((s) => {
        const nextOpen = s.openNoteIds.filter((openId) => openId !== id);
        if (s.activeNoteId !== id) return { openNoteIds: nextOpen };
        const closedIndex = s.openNoteIds.indexOf(id);
        const fallbackId = nextOpen[closedIndex - 1] || nextOpen[closedIndex] || null;
        return { openNoteIds: nextOpen, activeNoteId: fallbackId };
    }),
    toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
    toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
    toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
    toggleIsDocumentMode: () => {
        const nextMode: ViewMode = get().isDocumentMode ? 'raw' : 'preview';
        get().setViewMode(nextMode, get().activeNoteId);
    },
    setViewMode: (mode, noteId) => {
        const ts = Date.now();
        const nextByNote = { ...get().viewModeByNoteId };
        if (noteId) {
            nextByNote[noteId] = mode;
            localStorage.setItem('leaf-view-mode-by-note', JSON.stringify(nextByNote));
        }
        localStorage.setItem('leaf-view-mode', mode);
        localStorage.setItem('leaf-view-mode-at', String(ts));
        set({
            isDocumentMode: mode === 'preview',
            lastViewMode: mode,
            lastViewModeAt: ts,
            viewModeByNoteId: nextByNote,
        });
    },
    toggleMonochromeMode: () => set((s) => {
        const next = !s.monochromeMode;
        localStorage.setItem('leaf-monochrome', JSON.stringify(next));
        return { monochromeMode: next };
    }),
    setEditorFontSize: (size) => {
        const next = normalizeEditorFontSize(size);
        set({ editorFontSize: next });
        applyEditorPreferences(next, get().editorLineHeight, get().editorContentWidth);
        void db.settings.put({ key: 'editorFontSize', value: String(next) });
    },
    setEditorLineHeight: (lineHeight) => {
        const next = normalizeEditorLineHeight(lineHeight);
        set({ editorLineHeight: next });
        applyEditorPreferences(get().editorFontSize, next, get().editorContentWidth);
        void db.settings.put({ key: 'editorLineHeight', value: String(next) });
    },
    setEditorContentWidth: (width) => {
        const next = normalizeEditorContentWidth(width);
        set({ editorContentWidth: next });
        applyEditorPreferences(get().editorFontSize, get().editorLineHeight, next);
        void db.settings.put({ key: 'editorContentWidth', value: String(next) });
    },
    resetEditorPreferences: () => {
        set({
            editorFontSize: DEFAULT_EDITOR_FONT_SIZE,
            editorLineHeight: DEFAULT_EDITOR_LINE_HEIGHT,
            editorContentWidth: DEFAULT_EDITOR_CONTENT_WIDTH,
        });
        applyEditorPreferences(
            DEFAULT_EDITOR_FONT_SIZE,
            DEFAULT_EDITOR_LINE_HEIGHT,
            DEFAULT_EDITOR_CONTENT_WIDTH
        );
        void Promise.all([
            db.settings.put({ key: 'editorFontSize', value: String(DEFAULT_EDITOR_FONT_SIZE) }),
            db.settings.put({ key: 'editorLineHeight', value: String(DEFAULT_EDITOR_LINE_HEIGHT) }),
            db.settings.put({ key: 'editorContentWidth', value: String(DEFAULT_EDITOR_CONTENT_WIDTH) }),
        ]);
    },
    setSearchQuery: (q) => set({ searchQuery: q }),

    setTheme: (theme) => {
        const resolvedTheme = resolveTheme(theme);
        set({ theme, resolvedTheme });
        applyTheme(theme, get().accentColor);
        db.settings.put({ key: 'theme', value: theme });
        localStorage.setItem('theme', theme);
    },

    setResolvedTheme: (resolvedTheme) => {
        set({ resolvedTheme });
        document.documentElement.setAttribute('data-theme', resolvedTheme);
        document.documentElement.style.colorScheme = resolvedTheme;
    },

    setAccentColor: (color) => {
        set({ accentColor: color });
        applyTheme(get().theme, color);
        db.settings.put({ key: 'accentColor', value: color });
    },

    createNote: async (folderId) => {
        const note: Note = {
            id: uuid(),
            title: '',
            content: '',
            folderId: folderId || get().activeFolderId || INBOX_FOLDER_ID,
            tags: [],
            starred: false,
            pinned: false,
            trashed: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            wordCount: 0,
            links: [],
        };
        await db.notes.add(note);
        set((s) => ({
            notes: [note, ...s.notes],
            activeNoteId: note.id,
            openNoteIds: s.openNoteIds.includes(note.id) ? s.openNoteIds : [...s.openNoteIds, note.id],
            activeSection: 'notes',
            pastActions: [...s.pastActions, { type: 'NOTE_CREATED', noteId: note.id }],
            futureActions: []
        }));
        return note;
    },

    updateNote: async (id, updates) => {
        // Find previous state for the properties being updated
        const currentNote = get().notes.find(n => n.id === id);
        const prev: Partial<Note> = {};
        if (currentNote) {
            for (const key in updates) {
                if (key !== 'updatedAt' && key !== 'embedding' && key !== 'similarNoteId') {
                    // @ts-expect-error - index access on Note is safe here due to filter
                    prev[key as keyof Note] = currentNote[key as keyof Note];
                }
            }
        }

        if (updates.content !== undefined && updates.title === undefined) {
            // Only compute if caller didn't already provide these
            updates.title = extractTitle(updates.content);
            updates.tags = extractTags(updates.content);
            updates.links = extractLinks(updates.content);
            updates.wordCount = countWords(updates.content);
        }

        const patched = { ...updates, updatedAt: new Date().toISOString() };

        // Only add to history if it's a structural change (not just content edits)
        const isContentOnlyUpdate = Object.keys(updates).every(k => k === 'content' || k === 'wordCount' || k === 'title');

        let newPastActions = get().pastActions;
        if (!isContentOnlyUpdate && currentNote) {
            const cleanUpdates: Partial<Note> = { ...updates };
            delete cleanUpdates.updatedAt;
            delete cleanUpdates.embedding;
            delete cleanUpdates.similarNoteId;

            if (Object.keys(cleanUpdates).length > 0) {
                newPastActions = [...newPastActions, { type: 'NOTE_UPDATED', noteId: id, prev, next: cleanUpdates }];
            }
        }

        // Update UI state FIRST (single set() call — fast path)
        set((s) => ({
            notes: s.notes.map((n) => (n.id === id ? { ...n, ...patched } : n)),
            pastActions: newPastActions,
            futureActions: isContentOnlyUpdate ? s.futureActions : []
        }));

        // Persist to DB (non-blocking — don't await)
        db.notes.update(id, patched);

        // Log first activity of the day immediately, then throttle subsequent writes
        if (updates.content !== undefined) {
            // Track edit for intelligence features
            const prevWc = currentNote?.wordCount || 0;
            const newWc = updates.wordCount || 0;
            const delta = newWc - prevWc;
            if (delta !== 0) {
                trackNoteEdit(id, delta);
            }

            if (delta !== 0) {
                if (!get().todayActive) {
                    logDailyActivity(1).then(() => getStreakData()).then(streakData => {
                        set({ streak: streakData.streak, todayActive: streakData.todayActive });
                    }).catch(() => { });
                } else if (!activityLogTimer) {
                    activityLogTimer = setTimeout(() => {
                        activityLogTimer = null;
                        logDailyActivity(1).then(() => getStreakData()).then(streakData => {
                            set({ streak: streakData.streak, todayActive: streakData.todayActive });
                        }).catch(() => { });
                    }, 5000); // Log at most once every 5 seconds during active editing
                }
            }
        }
    },

    deleteNote: async (id) => {
        const updatedAt = new Date().toISOString();
        await db.notes.update(id, { trashed: true, updatedAt });
        set((s) => ({
            notes: s.notes.map((n) =>
                n.id === id ? { ...n, trashed: true, updatedAt } : n
            ),
            activeNoteId: s.activeNoteId === id ? null : s.activeNoteId,
            openNoteIds: s.openNoteIds.filter((openId) => openId !== id),
            pastActions: [...s.pastActions, { type: 'NOTE_DELETED', noteId: id }],
            futureActions: []
        }));
    },

    undoDeleteNote: async (id) => {
        await db.notes.update(id, { trashed: false });
        set((s) => ({
            notes: s.notes.map((n) =>
                n.id === id ? { ...n, trashed: false } : n
            ),
        }));
    },

    restoreNote: async (id) => {
        const updatedAt = new Date().toISOString();
        await db.notes.update(id, { trashed: false, updatedAt });
        set((s) => ({
            notes: s.notes.map((n) =>
                n.id === id ? { ...n, trashed: false, updatedAt } : n
            ),
        }));
    },

    permanentlyDeleteNote: async (id) => {
        await db.notes.delete(id);
        await db.versions.where('noteId').equals(id).delete();
        set((s) => ({
            notes: s.notes.filter((n) => n.id !== id),
            activeNoteId: s.activeNoteId === id ? null : s.activeNoteId,
            openNoteIds: s.openNoteIds.filter((openId) => openId !== id),
            selectedNoteIds: s.selectedNoteIds.filter((selectedId) => selectedId !== id),
        }));
    },

    emptyTrash: async () => {
        const trashedIds = get().notes.filter((n) => n.trashed).map((n) => n.id);
        if (trashedIds.length === 0) return 0;

        await db.transaction('rw', db.notes, db.versions, async () => {
            await db.notes.bulkDelete(trashedIds);
            await db.versions.where('noteId').anyOf(trashedIds).delete();
        });

        set((s) => ({
            notes: s.notes.filter((n) => !n.trashed),
            activeNoteId: s.activeNoteId && trashedIds.includes(s.activeNoteId) ? null : s.activeNoteId,
            openNoteIds: s.openNoteIds.filter((openId) => !trashedIds.includes(openId)),
            selectedNoteIds: s.selectedNoteIds.filter((id) => !trashedIds.includes(id)),
        }));

        return trashedIds.length;
    },

    starNote: async (id) => {
        const note = get().notes.find((n) => n.id === id);
        if (!note) return;
        const starred = !note.starred;
        await db.notes.update(id, { starred });
        set((s) => ({
            notes: s.notes.map((n) => (n.id === id ? { ...n, starred } : n)),
        }));
    },

    toggleNoteSelection: (id) => set((s) => ({
        selectedNoteIds: s.selectedNoteIds.includes(id)
            ? s.selectedNoteIds.filter(nId => nId !== id)
            : [...s.selectedNoteIds, id]
    })),

    clearSelection: () => set({ selectedNoteIds: [] }),

    selectAllNotes: (ids) => set({ selectedNoteIds: ids }),

    deleteSelectedNotes: async () => {
        const ids = get().selectedNoteIds;
        const nowIso = new Date().toISOString();
        // Update all selected items in Dexie
        await db.notes.bulkUpdate(ids.map(id => ({ key: id, changes: { trashed: true, updatedAt: nowIso } })));

        set((s) => {
            const idsSet = new Set(ids);
            return {
                notes: s.notes.map((n) => idsSet.has(n.id) ? { ...n, trashed: true, updatedAt: nowIso } : n),
                activeNoteId: s.activeNoteId && idsSet.has(s.activeNoteId) ? null : s.activeNoteId,
                openNoteIds: s.openNoteIds.filter((openId) => !idsSet.has(openId)),
                selectedNoteIds: [],
                pastActions: [...s.pastActions, { type: 'NOTES_BULK_DELETED', noteIds: ids }],
                futureActions: []
            };
        });
    },

    restoreSelectedNotes: async () => {
        const ids = get().selectedNoteIds;
        const nowIso = new Date().toISOString();
        // Update all selected items in Dexie
        await db.notes.bulkUpdate(ids.map(id => ({ key: id, changes: { trashed: false, updatedAt: nowIso } })));

        set((s) => {
            const idsSet = new Set(ids);
            return {
                notes: s.notes.map((n) => idsSet.has(n.id) ? { ...n, trashed: false, updatedAt: nowIso } : n),
                selectedNoteIds: [],
            };
        });
    },

    moveSelectedNotes: async (folderId) => {
        const ids = get().selectedNoteIds;
        const nowIso = new Date().toISOString();
        await db.notes.bulkUpdate(ids.map(id => ({ key: id, changes: { folderId, updatedAt: nowIso } })));

        set((s) => {
            const idsSet = new Set(ids);
            return {
                notes: s.notes.map((n) => idsSet.has(n.id) ? { ...n, folderId, updatedAt: nowIso } : n),
                selectedNoteIds: []
            };
        });
    },

    createFolder: async (name, parentId = null) => {
        const maxOrder = get().folders.reduce((m, f) => Math.max(m, f.sortOrder), 0);
        const folder: Folder = {
            id: uuid(),
            name,
            parentId,
            color: null,
            icon: '📁',
            sortOrder: maxOrder + 1,
            createdAt: Date.now(),
        };
        await db.folders.add(folder);
        set((s) => ({ folders: [...s.folders, folder] }));
        return folder;
    },

    updateFolder: async (id, updates) => {
        await db.folders.update(id, updates);
        set((s) => ({
            folders: s.folders.map((f) => (f.id === id ? { ...f, ...updates } : f)),
        }));
    },

    deleteFolder: async (id) => {
        // Move notes in this folder to Inbox
        const notesInFolder = get().notes.filter((n) => n.folderId === id);
        for (const n of notesInFolder) {
            await db.notes.update(n.id, { folderId: INBOX_FOLDER_ID });
        }
        // Delete child folders recursively
        const childFolders = get().folders.filter((f) => f.parentId === id);
        for (const cf of childFolders) {
            await get().deleteFolder(cf.id);
        }
        await db.folders.delete(id);
        set((s) => ({
            folders: s.folders.filter((f) => f.id !== id),
            notes: s.notes.map((n) =>
                n.folderId === id ? { ...n, folderId: INBOX_FOLDER_ID } : n
            ),
            activeFolderId: s.activeFolderId === id ? INBOX_FOLDER_ID : s.activeFolderId,
        }));
    },

    undo: async () => {
        const state = get();
        if (state.pastActions.length === 0) return;
        const lastAction = state.pastActions[state.pastActions.length - 1];

        // Remove from past, add to future
        const newPast = state.pastActions.slice(0, -1);
        const newFuture = [lastAction, ...state.futureActions];

        // Process undo
        switch (lastAction.type) {
            case 'NOTE_CREATED':
                // Undo create -> trash note
                await db.notes.update(lastAction.noteId, { trashed: true });
                set({
                    notes: state.notes.map(n => n.id === lastAction.noteId ? { ...n, trashed: true } : n),
                    activeNoteId: state.activeNoteId === lastAction.noteId ? null : state.activeNoteId
                });
                break;
            case 'NOTE_DELETED':
                // Undo delete -> restore note
                await db.notes.update(lastAction.noteId, { trashed: false });
                set({ notes: state.notes.map(n => n.id === lastAction.noteId ? { ...n, trashed: false } : n) });
                break;
            case 'NOTES_BULK_DELETED': {
                // Undo bulk delete -> restore notes
                const idsSet = new Set(lastAction.noteIds);
                await db.notes.bulkUpdate(lastAction.noteIds.map(id => ({ key: id, changes: { trashed: false } })));
                set({ notes: state.notes.map(n => idsSet.has(n.id) ? { ...n, trashed: false } : n) });
                break;
            }
            case 'NOTE_UPDATED':
                // Undo update -> apply 'prev' properties
                await db.notes.update(lastAction.noteId, lastAction.prev);
                set({ notes: state.notes.map(n => n.id === lastAction.noteId ? { ...n, ...lastAction.prev } : n) });
                break;
        }

        set({ pastActions: newPast, futureActions: newFuture });
    },

    redo: async () => {
        const state = get();
        if (state.futureActions.length === 0) return;
        const nextAction = state.futureActions[0];

        // Remove from future, add to past
        const newFuture = state.futureActions.slice(1);
        const newPast = [...state.pastActions, nextAction];

        // Process redo
        switch (nextAction.type) {
            case 'NOTE_CREATED':
                await db.notes.update(nextAction.noteId, { trashed: false });
                set({ notes: state.notes.map(n => n.id === nextAction.noteId ? { ...n, trashed: false } : n) });
                break;
            case 'NOTE_DELETED':
                await db.notes.update(nextAction.noteId, { trashed: true });
                set({
                    notes: state.notes.map(n => n.id === nextAction.noteId ? { ...n, trashed: true } : n),
                    activeNoteId: state.activeNoteId === nextAction.noteId ? null : state.activeNoteId
                });
                break;
            case 'NOTES_BULK_DELETED': {
                const idsSet = new Set(nextAction.noteIds);
                await db.notes.bulkUpdate(nextAction.noteIds.map(id => ({ key: id, changes: { trashed: true } })));
                set({
                    notes: state.notes.map(n => idsSet.has(n.id) ? { ...n, trashed: true } : n),
                    activeNoteId: state.activeNoteId && idsSet.has(state.activeNoteId) ? null : state.activeNoteId
                });
                break;
            }
            case 'NOTE_UPDATED':
                await db.notes.update(nextAction.noteId, nextAction.next);
                set({ notes: state.notes.map(n => n.id === nextAction.noteId ? { ...n, ...nextAction.next } : n) });
                break;
        }

        set({ pastActions: newPast, futureActions: newFuture });
    },

    refreshNotes: async () => {
        const notes = await db.notes.toArray();
        set({ notes });
    },

    refreshFolders: async () => {
        const folders = await db.folders.orderBy('sortOrder').toArray();
        set({ folders });
    },

    refreshStreak: async () => {
        const streakData = await getStreakData();
        set({ streak: streakData.streak, todayActive: streakData.todayActive });
    },
}));

/* ─── Theme Helper ─── */
function resolveTheme(themeSetting: 'light' | 'dark' | 'system'): 'light' | 'dark' {
    if (themeSetting === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return themeSetting;
}

function applyTheme(theme: 'light' | 'dark' | 'system', accentColor: string) {
    const resolvedTheme = resolveTheme(theme);
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.style.colorScheme = resolvedTheme;

    // Apply accent color
    document.documentElement.style.setProperty('--color-accent', accentColor);

    // Calculate light and hover variants
    // Assuming HSL format "hsl(h s% l%)"
    const match = accentColor.match(/hsl\((\d+)\s+([\d.]+)%\s+([\d.]+)%\)/);
    if (match) {
        const [, h, s, l] = match;
        document.documentElement.style.setProperty('--accent-h', h);
        document.documentElement.style.setProperty('--accent-s', `${s}%`);
        document.documentElement.style.setProperty('--color-accent-hover', `hsl(${h} ${s}% calc(${l}% - 5%))`);
        document.documentElement.style.setProperty('--color-accent-light', `hsl(${h} ${s}% calc(${l}% + 45%))`);
    } else {
        // Fallbacks if not strictly HSL structured like that
        document.documentElement.style.setProperty('--color-accent-hover', accentColor);
        document.documentElement.style.setProperty('--color-accent-light', 'rgba(120, 120, 120, 0.1)');
    }
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function readStoredNumber(key: string, fallback: number, min: number, max: number) {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
}

function normalizeEditorFontSize(value: string | number | null | undefined) {
    const parsed = Number(value);
    return Number.isFinite(parsed)
        ? Math.round(clamp(parsed, MIN_EDITOR_FONT_SIZE, MAX_EDITOR_FONT_SIZE))
        : DEFAULT_EDITOR_FONT_SIZE;
}

function normalizeEditorLineHeight(value: string | number | null | undefined) {
    const parsed = Number(value);
    return Number.isFinite(parsed)
        ? Math.round(clamp(parsed, MIN_EDITOR_LINE_HEIGHT, MAX_EDITOR_LINE_HEIGHT) * 100) / 100
        : DEFAULT_EDITOR_LINE_HEIGHT;
}

function normalizeEditorContentWidth(value: string | number | null | undefined) {
    const parsed = Number(value);
    return Number.isFinite(parsed)
        ? Math.round(clamp(parsed, 480, 1600))
        : DEFAULT_EDITOR_CONTENT_WIDTH;
}

function applyEditorPreferences(fontSize: number, lineHeight: number, contentWidth: number) {
    const root = document.documentElement;
    root.style.setProperty('--editor-body', `${normalizeEditorFontSize(fontSize)}px`);
    root.style.setProperty('--editor-lh', String(normalizeEditorLineHeight(lineHeight)));
    root.style.setProperty('--editor-width', `${normalizeEditorContentWidth(contentWidth)}px`);

    localStorage.setItem('leaf-editor-font-size', String(normalizeEditorFontSize(fontSize)));
    localStorage.setItem('leaf-editor-line-height', String(normalizeEditorLineHeight(lineHeight)));
    localStorage.setItem('leaf-editor-content-width', String(normalizeEditorContentWidth(contentWidth)));
}

/* ─── Global system theme listener (runs outside React tree) ─── */
const systemMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
const handleSystemThemeChange = (event: MediaQueryListEvent | MediaQueryList) => {
    const state = useStore.getState();
    if (state.theme === 'system') {
        const resolved = event.matches ? 'dark' : 'light';
        state.setResolvedTheme(resolved);
    }
};

if (typeof systemMediaQuery.addEventListener === 'function') {
    systemMediaQuery.addEventListener('change', handleSystemThemeChange);
} else if (typeof systemMediaQuery.addListener === 'function') {
    systemMediaQuery.addListener(handleSystemThemeChange);
}

// Ensure initial document theme matches system before React paints anything else
applyTheme(useStore.getState().theme, useStore.getState().accentColor);
applyEditorPreferences(
    useStore.getState().editorFontSize,
    useStore.getState().editorLineHeight,
    useStore.getState().editorContentWidth
);
