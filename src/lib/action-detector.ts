/* ═══════════════════════════════════════════════════════════════
   📌 Action Item Detector — Finds commitments & action items in notes
   ═══════════════════════════════════════════════════════════════ */

import type { Note } from './db';

export interface ActionItem {
    noteId: string;
    noteTitle: string;
    text: string;
    type: 'todo' | 'commitment' | 'deadline' | 'followup';
    urgency: 'high' | 'medium' | 'low';
    dueHint?: string; // extracted date reference
}

// Patterns that indicate action items
const TODO_PATTERNS = [
    /\[\s?\]\s+(.+)/gm,                           // [ ] unchecked todos
    /^[-*]\s+(?:TODO|FIXME|HACK)[\s:]+(.+)/gim,   // - TODO: something
];

const COMMITMENT_PATTERNS = [
    /\b(?:i\s+(?:need|must|should|will|have)\s+to|i'll|i\s+want\s+to|gotta|gonna)\s+(.{10,80})/gi,
    /\b(?:don't\s+forget\s+to|remember\s+to|make\s+sure\s+to)\s+(.{10,60})/gi,
];

const DEADLINE_PATTERNS = [
    /\b(?:by|before|due|until|deadline)\s+(.{5,40})/gi,
    /\b(?:next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month))\b/gi,
    /\b(?:tomorrow|tonight|end\s+of\s+(?:day|week|month))\b/gi,
];

const FOLLOWUP_PATTERNS = [
    /\b(?:follow\s*up|check\s+(?:with|on|back)|circle\s+back|ping|reach\s+out\s+to|email|call|message)\s+(.{5,60})/gi,
    /\b(?:waiting\s+(?:for|on)|pending(?:\s+from)?)\s+(.{5,60})/gi,
];

function extractMatches(
    text: string,
    patterns: RegExp[],
    type: ActionItem['type'],
    noteId: string,
    noteTitle: string,
): ActionItem[] {
    const items: ActionItem[] = [];
    const seen = new Set<string>();

    for (const pattern of patterns) {
        // Reset regex state
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const rawText = (match[1] || match[0]).trim();
            // Clean up
            const cleaned = rawText
                .replace(/^[-*•]\s*/, '')
                .replace(/[\n\r]+.*$/, '')
                .slice(0, 100);

            if (cleaned.length < 5 || seen.has(cleaned.toLowerCase())) continue;
            seen.add(cleaned.toLowerCase());

            items.push({
                noteId,
                noteTitle,
                text: cleaned,
                type,
                urgency: type === 'deadline' ? 'high' : type === 'todo' ? 'medium' : 'low',
            });
        }
    }
    return items;
}

/**
 * Scan a note for action items, commitments, deadlines, and follow-ups.
 */
export function detectActionItems(note: Note): ActionItem[] {
    if (!note.content || note.trashed) return [];
    const title = note.title || 'Untitled';

    return [
        ...extractMatches(note.content, TODO_PATTERNS, 'todo', note.id, title),
        ...extractMatches(note.content, COMMITMENT_PATTERNS, 'commitment', note.id, title),
        ...extractMatches(note.content, DEADLINE_PATTERNS, 'deadline', note.id, title),
        ...extractMatches(note.content, FOLLOWUP_PATTERNS, 'followup', note.id, title),
    ];
}

/**
 * Scan ALL notes and return a deduplicated, prioritized list of action items.
 */
export function detectAllActionItems(notes: Note[]): ActionItem[] {
    const all: ActionItem[] = [];
    for (const note of notes) {
        if (!note.trashed) {
            all.push(...detectActionItems(note));
        }
    }

    // Sort: high urgency first, then deadlines, then todos
    const urgencyOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const typeOrder: Record<string, number> = { deadline: 0, todo: 1, followup: 2, commitment: 3 };

    all.sort((a, b) => {
        const ud = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        if (ud !== 0) return ud;
        return typeOrder[a.type] - typeOrder[b.type];
    });

    return all.slice(0, 25); // cap at 25
}
