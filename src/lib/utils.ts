import { useCallback, useRef } from 'react';
import { parseDocument } from './parser';

/* ─── Debounce Hook ─── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDebounce<T extends (...args: any[]) => any>(
    fn: T,
    delay: number
) {
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    return useCallback(
        (...args: Parameters<T>) => {
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => fn(...args), delay);
        },
        [fn, delay]
    );
}

/* ─── Word Count ─── */
export function countWords(text: string): number {
    return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/* ─── Reading Time (avg 200wpm) ─── */
export function readingTime(wordCount: number): string {
    const mins = Math.ceil(wordCount / 200);
    return mins < 1 ? 'less than a min' : `${mins} min read`;
}

/* ─── Extract Tags from Content ─── */
export function extractTags(content: string): string[] {
    const matches = content.match(/(?:^|\s)#([\w\-/]+)/g);
    if (!matches) return [];
    return [...new Set(matches.map((m) => m.trim().slice(1)))];
}

/* ─── Extract Links from Content ([[Note Title]]) ─── */
export function extractLinks(content: string): string[] {
    const matches = content.match(/\[\[(.*?)\]\]/g);
    if (!matches) return [];
    return [...new Set(matches.map((m) => m.slice(2, -2).trim()))];
}

/* ─── Extract Title from Content ─── */
export function extractTitle(content: string): string {
    const lines = content.split('\n');
    const blockTagRegex = /^\(([a-z]+)(?:\s+.*)?\)$/i;
    for (const line of lines) {
        const h1Match = line.match(/^#\s+(.+)/);
        if (h1Match) return h1Match[1].trim();
    }
    // Use first non-empty line that isn't a block tag
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !blockTagRegex.test(trimmed)) return trimmed.slice(0, 80);
    }
    return 'Untitled';
}

/* ─── Extract Preview Text from Content ─── */
const READABLE_BLOCK_TYPES = new Set(['text', 'callout', 'quote', 'todo']);

function stripMarkdown(text: string): string {
    return text
        .replace(/!\[.*?\]\(.*?\)/g, '')          // images ![alt](url)
        .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')     // links [text](url)  →  text
        .replace(/\[\[([^\]]*)\]\]/g, '$1')         // wiki links [[Note]]  →  Note
        .replace(/`{1,3}[^`]*`{1,3}/g, '')         // inline code / triple backtick
        .replace(/https?:\/\/\S+/g, '')             // bare URLs
        .replace(/^#{1,6}\s+/gm, '')                // heading markers
        .replace(/^[-*+]\s+/gm, '')                 // unordered list markers
        .replace(/^\d+\.\s+/gm, '')                 // ordered list markers
        .replace(/^-{3,}$/gm, '')                   // horizontal rules
        .replace(/\[[ x]\]\s*/gi, '')               // checkbox markers [ ] [x]
        .replace(/[*_~`>|]/g, '')                    // bold/italic/strike/code/quote/pipe chars
        .replace(/\s+/g, ' ')                        // normalize whitespace
        .trim();
}

export function extractPreviewText(content: string, max = 60): string {
    if (!content) return '';

    const blocks = parseDocument(content);
    let skipTitle = true;
    const parts: string[] = [];
    let length = 0;

    for (const block of blocks) {
        if (length >= max) break;

        // Only extract text from readable block types
        if (!READABLE_BLOCK_TYPES.has(block.type)) continue;

        const lines = block.content.split('\n');
        for (const line of lines) {
            if (length >= max) break;

            const trimmed = line.trim();
            if (!trimmed) continue;

            // Skip the first heading (that's the note title, already shown separately)
            if (skipTitle && /^#{1,6}\s+/.test(trimmed)) {
                skipTitle = false;
                continue;
            }

            const cleaned = stripMarkdown(trimmed);
            if (cleaned) {
                parts.push(cleaned);
                length = parts.join(' ').length;
            }
        }
    }

    const result = parts.join(' ');
    return result.length > max ? result.slice(0, max) + '…' : result;
}

/* ─── Relative Time ─── */
export function relativeTime(timestamp: number | string): string {
    const ts = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
    });
}

/* ─── Truncate ─── */
export function truncate(str: string, max: number): string {
    return str.length > max ? str.slice(0, max) + '...' : str;
}
