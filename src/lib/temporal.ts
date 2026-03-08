/* ═══════════════════════════════════════════════════════════════
   🕐 Temporal Intelligence — Contextual timestamps
   ═══════════════════════════════════════════════════════════════ */

import type { Note } from './db';

/* ─── Helpers ─── */

function daysBetween(a: number, b: number): number {
    return Math.floor(Math.abs(a - b) / 86_400_000);
}

function isSameDay(a: number, b: number): boolean {
    const da = new Date(a), db = new Date(b);
    return da.getFullYear() === db.getFullYear() &&
        da.getMonth() === db.getMonth() &&
        da.getDate() === db.getDate();
}

function getTimeOfDay(ts: number): string {
    const h = new Date(ts).getHours();
    if (h < 6) return 'late night';
    if (h < 9) return 'early morning';
    if (h < 12) return 'morning';
    if (h < 14) return 'around noon';
    if (h < 17) return 'afternoon';
    if (h < 20) return 'evening';
    return 'night';
}

function getDayName(ts: number): string {
    return new Date(ts).toLocaleDateString('en-US', { weekday: 'long' });
}

function getMonthDay(ts: number): string {
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ─── Core Contextual Timestamp ─── */

/**
 * Transforms a note's timestamp into a contextually meaningful description.
 * Falls back to standard relative time if no context is available.
 */
export function formatContextualTime(
    note: Note,
    allNotes?: Note[],
): string {
    const now = Date.now();
    const ts = new Date(note.updatedAt).getTime();
    const diff = now - ts;
    const days = daysBetween(now, ts);

    // Just now (< 1 minute)
    if (diff < 60_000) return 'Just now';

    // Minutes ago (< 1 hour)
    if (diff < 3_600_000) {
        const mins = Math.floor(diff / 60_000);
        return `${mins}m ago`;
    }

    // Today — show time of day context
    if (isSameDay(ts, now)) {
        const timeOfDay = getTimeOfDay(ts);
        const h = new Date(ts).getHours();
        const m = new Date(ts).getMinutes();
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        const timeStr = `${h12}:${String(m).padStart(2, '0')} ${ampm}`;

        // Check if user was in a burst session (multiple notes within an hour)
        if (allNotes) {
            const sessionNotes = allNotes.filter(n =>
                n.id !== note.id &&
                Math.abs(new Date(n.updatedAt).getTime() - ts) < 3_600_000 &&
                isSameDay(new Date(n.updatedAt).getTime(), ts)
            );
            if (sessionNotes.length >= 2) {
                return `Today ${timeOfDay} · writing session`;
            }
        }

        return `Today, ${timeStr}`;
    }

    // Yesterday
    const yesterday = now - 86_400_000;
    if (isSameDay(ts, yesterday)) {
        return `Yesterday ${getTimeOfDay(ts)}`;
    }

    // This week (2-6 days ago)
    if (days <= 6) {
        const dayName = getDayName(ts);
        return `${dayName} ${getTimeOfDay(ts)}`;
    }

    // Last week
    if (days <= 13) {
        return `Last ${getDayName(ts)}`;
    }

    // 2-4 weeks ago
    if (days <= 30) {
        const weeks = Math.floor(days / 7);
        return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    }

    // Same year — show Month Day
    const noteYear = new Date(ts).getFullYear();
    const currentYear = new Date(now).getFullYear();

    if (noteYear === currentYear) {
        return getMonthDay(ts);
    }

    // Older — show Month Day, Year
    return new Date(ts).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });
}

/**
 * Returns the exact timestamp for tooltip display.
 */
export function formatExactTime(ts: number): string {
    return new Date(ts).toLocaleString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

/**
 * Generates a short relative time string (for compact displays).
 */
export function formatRelativeShort(ts: number): string {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
}
