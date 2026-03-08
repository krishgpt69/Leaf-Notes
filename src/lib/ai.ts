// Client side wrapper for the AI Web Worker

let worker: Worker | null = null;
let callbackId = 0;
const callbacks = new Map<number, { resolve: (value: unknown) => void, reject: (reason?: unknown) => void }>();

function getWorker() {
    if (!worker) {
        // Instantiate the worker
        worker = new Worker(new URL('../workers/ai-worker.ts', import.meta.url), { type: 'module' });

        // Listen for messages from the worker
        worker.onmessage = (e) => {
            const { id, result, error } = e.data;
            if (callbacks.has(id)) {
                const { resolve, reject } = callbacks.get(id)!;
                if (error) {
                    reject(new Error(error));
                } else {
                    resolve(result);
                }
                callbacks.delete(id);
            }
        };
    }
    return worker;
}

function runAction<T>(action: string, payload: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
        const id = ++callbackId;
        callbacks.set(id, { resolve: resolve as (value: unknown) => void, reject });
        getWorker().postMessage({ id, action, payload });
    });
}

class AIService {
    /**
     * Generates a multi-format summary (one-line, short, detailed).
     */
    async summarizeNote(text: string): Promise<{ oneLine: string, short: string, detailed: string }> {
        return runAction('summarizeNote', { text });
    }

    /**
     * Suggests a concise title for a note.
     */
    async suggestTitle(text: string): Promise<string> {
        return runAction('suggestTitle', { text });
    }

    /**
     * Extracts top keyphrases from a note.
     */
    async extractKeywords(text: string): Promise<string[]> {
        return runAction('extractKeywords', { text });
    }

    /**
     * Calculates readability scores.
     */
    async getReadability(text: string): Promise<{ grade: number, readingEase: number }> {
        return runAction('readability', { text });
    }

    /**
     * Detects if a note is high priority.
     */
    async detectPriority(text: string): Promise<'high' | 'low'> {
        return runAction('detectPriority', { text });
    }

    /**
     * Finds the best answer from notes for a given question.
     */
    async askNotes(query: string, notes: unknown[]): Promise<{ snippet: string, noteId: string }> {
        return runAction('askNotes', { query, notes });
    }

    /**
     * Placeholder for legacy rewrite (now uses prompt heuristics).
     */
    async rewriteText(text: string): Promise<string> {
        // Since we moved to generative-less, we simulate a simple rewrite or use heuristics.
        // For now, return a placeholder or simple transformation.
        return text;
    }
}

export const ai = new AIService();
