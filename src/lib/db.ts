import Dexie, { type EntityTable } from 'dexie';

/* ═══════════════════════════════════════════════════════════════
   🍃 Leaf Database — Dexie.js / IndexedDB
   ═══════════════════════════════════════════════════════════════ */

export interface PlacedSticker {
    stickerId: string;
    x: number;        // percentage from left (0–100)
    y: number;        // percentage from top (0–100) or offset from anchorLine
    scale: number;    // 0.5 – 2
    rotation: number; // degrees
    filter?: string;  // CSS filter to apply
    anchorLine?: number; // Line index in the editor
    anchorOffset?: number; // Y-offset from the start of the line (px)
}

export interface Note {
    id: string;
    title: string;
    content: string;
    folderId: string;
    tags: string[];
    starred: boolean;
    pinned: boolean;
    trashed: boolean;
    createdAt: string;
    updatedAt: string;
    wordCount: number;
    links?: string[]; // Array of linked note titles
    placedStickers?: PlacedSticker[];

    // AI Metadata
    embedding?: number[];
    priority?: 'high' | 'medium' | 'low';
    category?: string;
    similarNoteId?: string;
}

export interface Folder {
    id: string;
    name: string;
    parentId: string | null;
    color: string | null;
    icon: string | null;
    sortOrder: number;
    createdAt: number;
}

export interface NoteVersion {
    id: string;
    noteId: string;
    content: string;
    createdAt: number;
    wordCount: number;
}

export interface AppSettings {
    key: string;
    value: string;
}

export interface Sticker {
    id: string;
    name: string;
    originalBlob: Blob;
    stickerBlob: Blob; // transparent PNG
    thumbnailUrl: string; // data URL for fast grid rendering
    width: number;
    height: number;
    createdAt: number;
}

export interface DailyActivity {
    date: string; // YYYY-MM-DD format
    notesEdited: number;
    lastEditedAt?: number;
}

/* ─── Intelligence Tables ─── */

export interface NoteActivity {
    id?: number;          // auto-increment
    noteId: string;
    action: 'open' | 'edit' | 'close';
    timestamp: number;    // Date.now()
    duration?: number;    // ms spent (for 'close' events)
    wordDelta?: number;   // change in word count (for 'edit' events)
}

export interface UserPatterns {
    key: string;          // pattern identifier e.g. 'peakHours', 'routines'
    data: string;         // JSON-serialized pattern data
    updatedAt: number;
}

class LeafDatabase extends Dexie {
    notes!: EntityTable<Note, 'id'>;
    folders!: EntityTable<Folder, 'id'>;
    versions!: EntityTable<NoteVersion, 'id'>;
    settings!: EntityTable<AppSettings, 'key'>;
    stickers!: EntityTable<Sticker, 'id'>;
    activity!: EntityTable<DailyActivity, 'date'>;
    noteActivity!: EntityTable<NoteActivity, 'id'>;
    userPatterns!: EntityTable<UserPatterns, 'key'>;

    constructor() {
        super('LeafDB');
        this.version(1).stores({
            notes: 'id, folderId, *tags, starred, trashed, createdAt, modifiedAt',
            folders: 'id, parentId, sortOrder',
            versions: 'id, noteId, createdAt',
            settings: 'key',
        });
        this.version(2).stores({
            notes: 'id, folderId, *tags, starred, trashed, createdAt, modifiedAt',
            folders: 'id, parentId, sortOrder',
            versions: 'id, noteId, createdAt',
            settings: 'key',
            stickers: 'id, createdAt',
        });
        this.version(3).stores({
            notes: 'id, folderId, *tags, starred, trashed, createdAt, modifiedAt',
            folders: 'id, parentId, sortOrder',
            versions: 'id, noteId, createdAt',
            settings: 'key',
            stickers: 'id, createdAt',
            activity: 'date',
        });
        this.version(4).stores({
            notes: 'id, folderId, *tags, category, priority, starred, trashed, createdAt, modifiedAt',
            folders: 'id, parentId, sortOrder',
            versions: 'id, noteId, createdAt',
            settings: 'key',
            stickers: 'id, createdAt',
            activity: 'date',
        });
        this.version(6).stores({
            notes: 'id, folderId, *tags, *links, category, priority, starred, trashed, createdAt, modifiedAt',
            folders: 'id, parentId, sortOrder',
            versions: 'id, noteId, createdAt',
            settings: 'key',
            stickers: 'id, createdAt',
            activity: 'date',
        });
        this.version(7).stores({
            notes: 'id, folderId, *tags, *links, category, priority, starred, trashed, createdAt, modifiedAt',
            folders: 'id, parentId, sortOrder',
            versions: 'id, noteId, createdAt',
            settings: 'key',
            stickers: 'id, createdAt',
            activity: 'date',
            noteActivity: '++id, noteId, action, timestamp',
            userPatterns: 'key',
        });
        this.version(8).stores({
            notes: 'id, folderId, *tags, *links, category, priority, starred, trashed, createdAt, updatedAt',
            folders: 'id, parentId, sortOrder',
            versions: 'id, noteId, createdAt',
            settings: 'key',
            stickers: 'id, createdAt',
            activity: 'date',
            noteActivity: '++id, noteId, action, timestamp',
            userPatterns: 'key',
        });
    }
}

export const db = new LeafDatabase();

function localDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/* ─── Default Data ─── */

export const INBOX_FOLDER_ID = 'inbox';
export const TRASH_FOLDER_ID = '__trash__';

export async function initializeDefaultData() {
    const inboxExists = await db.folders.get(INBOX_FOLDER_ID);
    if (!inboxExists) {
        // First run initialization
        await db.folders.put({
            id: INBOX_FOLDER_ID,
            name: 'Inbox',
            parentId: null,
            color: null,
            icon: '📥',
            sortOrder: 0,
            createdAt: Date.now(),
        });

        const welcomeNoteId = crypto.randomUUID();
        await db.notes.put({
            id: welcomeNoteId,
            folderId: INBOX_FOLDER_ID,
            title: 'Welcome to Leaf 🍃',
            content: `Leaf is a fast, delightful note-taking app designed for speed and focus.

### Quick Tips
- Type \`# \` for a large heading
- Type \`- \` or \`* \` for a bulleted list
- Try dragging a sticker from the Stickers panel (if you have any!)

### Keyboard Shortcuts
- **Cmd/Ctrl + K** : Open the Command Palette to search or switch folders
- **Cmd/Ctrl + N** : Create a new note instantly
- **Cmd/Ctrl + \\** : Toggle the left sidebar

Happy writing!`,
            tags: ['welcome'],
            starred: true,
            pinned: false,
            trashed: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            wordCount: 71, // approximate
        });
    }

    // Initialize Starter Stickers independently of folders
    await initializeStarterStickers();
}

async function initializeStarterStickers() {
    const existing = await db.stickers.count();
    if (existing > 0) return;

    // We'll generate a few basic stickers using Canvas + emoji/text as placeholders
    // until the user creates their own. 
    const starterIcons = [
        { name: 'Leaf', icon: '🍃' },
        { name: 'Sparkles', icon: '✨' },
        { name: 'Sticky Note', icon: '📝' },
        { name: 'Target', icon: '🎯' },
        { name: 'Idea', icon: '💡' },
    ];

    for (const item of starterIcons) {
        const canvas = document.createElement('canvas');
        canvas.width = 120;
        canvas.height = 120;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.font = '80px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(item.icon, 60, 65);
        }

        const dataUrl = canvas.toDataURL('image/png');
        const response = await fetch(dataUrl);
        const blob = await response.blob();

        await db.stickers.put({
            id: crypto.randomUUID(),
            name: item.name,
            originalBlob: blob,
            stickerBlob: blob,
            thumbnailUrl: dataUrl,
            width: 120,
            height: 120,
            createdAt: Date.now(),
        });
    }
}

export async function logDailyActivity(increment = 1) {
    if (!increment || increment <= 0) return;
    const today = localDateKey(new Date());
    await db.transaction('rw', db.activity, async () => {
        const record = await db.activity.get(today);
        if (record) {
            await db.activity.update(today, { notesEdited: record.notesEdited + increment, lastEditedAt: Date.now() });
        } else {
            await db.activity.put({ date: today, notesEdited: increment, lastEditedAt: Date.now() });
        }
    });
}

export async function getStreakData() {
    const allActivity = await db.activity.orderBy('date').reverse().toArray();
    if (allActivity.length === 0) return { streak: 0, todayActive: false };

    const todayStr = localDateKey(new Date());
    let streak = 0;
    let todayActive = false;

    // Check if active today
    if (allActivity[0].date === todayStr) {
        todayActive = true;
        streak = 1;
    }

    // A simpler date-math string approach for checking consecutive days
    const checkDate = new Date();
    if (!todayActive) {
        // If not active today, check if active yesterday to keep streak alive
        checkDate.setDate(checkDate.getDate() - 1);
        const yesterdayStr = localDateKey(checkDate);
        if (allActivity[0].date !== yesterdayStr) {
            return { streak: 0, todayActive: false };
        }
        streak = 1;
    }

    // Count backwards for consecutive days
    for (let i = 1; i < allActivity.length; i++) {
        checkDate.setDate(checkDate.getDate() - 1);
        const expectedStr = localDateKey(checkDate);
        if (allActivity[i].date === expectedStr) {
            streak++;
        } else {
            break;
        }
    }

    return { streak, todayActive };
}
