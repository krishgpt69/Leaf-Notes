/* ═══════════════════════════════════════════════════════════════
   🧠 Activity Tracker — Records note interactions for intelligence
   ═══════════════════════════════════════════════════════════════ */

import { db, type NoteActivity } from './db';

/** In-memory session state — tracks what user is currently doing */
interface ActiveSession {
    noteId: string;
    startedAt: number;
    initialWordCount: number;
}

let activeSession: ActiveSession | null = null;

/* ─── Core Tracking Functions ─── */

/** Call when user opens/switches to a note */
export function trackNoteOpen(noteId: string, wordCount: number) {
    // Close previous session if any
    if (activeSession && activeSession.noteId !== noteId) {
        trackNoteClose(activeSession.noteId, wordCount);
    }

    activeSession = {
        noteId,
        startedAt: Date.now(),
        initialWordCount: wordCount,
    };

    // Fire-and-forget write
    db.noteActivity.add({
        noteId,
        action: 'open',
        timestamp: Date.now(),
    }).catch(() => { }); // silently fail
}

/** Call when user edits a note (debounced from store) */
export function trackNoteEdit(noteId: string, wordDelta: number) {
    db.noteActivity.add({
        noteId,
        action: 'edit',
        timestamp: Date.now(),
        wordDelta,
    }).catch(() => { });
}

/** Call when user leaves a note or closes app */
export function trackNoteClose(noteId: string, currentWordCount: number) {
    if (!activeSession || activeSession.noteId !== noteId) return;

    const duration = Date.now() - activeSession.startedAt;
    const wordDelta = currentWordCount - activeSession.initialWordCount;

    db.noteActivity.add({
        noteId,
        action: 'close',
        timestamp: Date.now(),
        duration,
        wordDelta,
    }).catch(() => { });

    activeSession = null;
}

/* ─── Query Functions (for intelligence features) ─── */

/** Get recent activity for a specific note */
export async function getNoteHistory(noteId: string, limit = 50): Promise<NoteActivity[]> {
    return db.noteActivity
        .where('noteId').equals(noteId)
        .reverse()
        .limit(limit)
        .toArray();
}

/** Get all activity within a time window */
export async function getActivityInRange(startMs: number, endMs: number): Promise<NoteActivity[]> {
    return db.noteActivity
        .where('timestamp').between(startMs, endMs)
        .toArray();
}

/** Get the last N unique notes the user interacted with */
export async function getRecentNoteIds(limit = 20): Promise<string[]> {
    const activities = await db.noteActivity
        .orderBy('timestamp')
        .reverse()
        .limit(200) // scan more to find unique
        .toArray();

    const seen = new Set<string>();
    const result: string[] = [];
    for (const a of activities) {
        if (!seen.has(a.noteId)) {
            seen.add(a.noteId);
            result.push(a.noteId);
            if (result.length >= limit) break;
        }
    }
    return result;
}

/** Count how many times a note was opened in the last N days */
export async function getNoteAccessCount(noteId: string, days = 30): Promise<number> {
    const since = Date.now() - days * 86_400_000;
    return db.noteActivity
        .where('[noteId+action]')
        .equals([noteId, 'open'])
        .filter(a => a.timestamp >= since)
        .count()
        .catch(() => {
            // Fallback if compound index doesn't exist
            return db.noteActivity
                .where('noteId').equals(noteId)
                .filter(a => a.action === 'open' && a.timestamp >= since)
                .count();
        });
}

/** Get total time spent on a note (sum of session durations) */
export async function getNoteTotalTime(noteId: string): Promise<number> {
    const closes = await db.noteActivity
        .where('noteId').equals(noteId)
        .filter(a => a.action === 'close' && a.duration != null)
        .toArray();

    return closes.reduce((sum, a) => sum + (a.duration || 0), 0);
}

/** Get which notes are frequently accessed together (co-occurrence in same hour) */
export async function getCoAccessedNotes(noteId: string, limit = 5): Promise<string[]> {
    const noteOpens = await db.noteActivity
        .where('noteId').equals(noteId)
        .filter(a => a.action === 'open')
        .toArray();

    const coNotes: Record<string, number> = {};
    const WINDOW = 3_600_000; // 1 hour

    for (const open of noteOpens) {
        const nearby = await db.noteActivity
            .where('timestamp')
            .between(open.timestamp - WINDOW, open.timestamp + WINDOW)
            .filter(a => a.action === 'open' && a.noteId !== noteId)
            .toArray();

        for (const n of nearby) {
            coNotes[n.noteId] = (coNotes[n.noteId] || 0) + 1;
        }
    }

    return Object.entries(coNotes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(e => e[0]);
}

/* ─── Cleanup ─── */

/** Prune activity older than 90 days to keep DB lean */
export async function pruneOldActivity(daysToKeep = 90) {
    const cutoff = Date.now() - daysToKeep * 86_400_000;
    await db.noteActivity.where('timestamp').below(cutoff).delete();
}
