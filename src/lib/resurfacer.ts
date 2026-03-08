/* ═══════════════════════════════════════════════════════════════
   💡 Note Resurfacing Engine — Surfaces relevant notes proactively
   ═══════════════════════════════════════════════════════════════ */

import type { Note } from './db';

/* ─── Lightweight TF-IDF keyword extraction (runs on main thread, fast) ─── */

const STOP = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'was',
    'are', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where',
    'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
    'such', 'very', 'just', 'too', 'now', 'not', 'no', 'than', 'only', 'also', 'with',
    'from', 'by', 'about', 'so', 'if', 'as', 'its', 'my', 'your', 'our', 'their', 'into',
]);

function extractKeywords(text: string, topN = 15): string[] {
    const words = text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/)
        .filter(w => w.length > 2 && !STOP.has(w));

    const freq: Record<string, number> = {};
    for (const w of words) freq[w] = (freq[w] || 0) + 1;

    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(e => e[0]);
}

function keywordOverlap(kwA: string[], kwB: string[]): number {
    const setB = new Set(kwB);
    let overlap = 0;
    for (const w of kwA) {
        if (setB.has(w)) overlap++;
    }
    // Jaccard-style: overlap / union
    const union = new Set([...kwA, ...kwB]).size;
    return union > 0 ? overlap / union : 0;
}

/* ─── Scoring Functions ─── */

/** Temporal relevance: boosts recently accessed/edited notes */
function temporalScore(note: Note, now: number): number {
    const daysSince = (now - new Date(note.updatedAt).getTime()) / 86_400_000;

    // Recent (< 7 days): high score, no decay
    if (daysSince < 7) return 1.0;
    // Medium term (7-30 days): linear decay
    if (daysSince < 30) return 1.0 - ((daysSince - 7) / 23) * 0.6;
    // Long term (30+ days): exponential decay with floor
    return Math.max(0.05, 0.4 * Math.exp(-(daysSince - 30) / 60));
}

/** Contextual relevance: keyword similarity to current note */
function contextualScore(
    currentKeywords: string[],
    candidateKeywords: string[]
): number {
    return keywordOverlap(currentKeywords, candidateKeywords);
}

/** Content quality bonus: longer, richer notes get slight boost */
function qualityScore(note: Note): number {
    const wc = note.wordCount || 0;
    if (wc < 20) return 0.2;    // very short
    if (wc < 50) return 0.5;    // short but has content
    if (wc < 200) return 0.8;   // good content
    return 1.0;                  // substantial note
}

/* ─── Main Resurfacing Function ─── */

export interface SurfacedNote {
    noteId: string;
    title: string;
    score: number;
    reason: string;
}

/**
 * Given the current note and all notes, find the most relevant ones to surface.
 * Pure function — no DB calls, fast enough for main thread.
 */
export function findRelevantNotes(
    currentNote: Note,
    allNotes: Note[],
    maxResults = 3,
): SurfacedNote[] {
    const now = Date.now();
    const currentKw = extractKeywords(currentNote.content);

    if (currentKw.length === 0) return [];

    const scored: SurfacedNote[] = [];

    for (const note of allNotes) {
        // Skip self, trashed, and very short notes
        if (note.id === currentNote.id || note.trashed || (note.wordCount || 0) < 10) continue;

        const candidateKw = extractKeywords(note.content);
        const ctx = contextualScore(currentKw, candidateKw);

        // Skip notes with zero keyword overlap
        if (ctx < 0.05) continue;

        const temp = temporalScore(note, now);
        const qual = qualityScore(note);

        // Composite score: Contextual matters most for resurfacing
        const composite = (ctx * 0.50) + (temp * 0.30) + (qual * 0.20);

        // Generate human-readable reason
        let reason = '';
        if (ctx > 0.3) {
            const shared = currentKw.filter(w => candidateKw.includes(w)).slice(0, 3);
            reason = `Related topics: ${shared.join(', ')}`;
        } else if (temp > 0.7) {
            reason = 'Recently edited';
        } else {
            reason = 'Related content';
        }

        scored.push({
            noteId: note.id,
            title: note.title || note.content.slice(0, 40),
            score: composite,
            reason,
        });
    }

    // Sort by score descending, take top N
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults);
}
