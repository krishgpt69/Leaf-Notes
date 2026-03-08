/**
 * 🍃 Leaf AI Worker — Mathematical & Linguistic Algorithms
 * Aggressive extractive summarization with TF-IDF, MMR, and compression.
 * No heavy models, zero-cost, 100% privacy-safe.
 */

// ─── STOPWORDS ───

const STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'is', 'was', 'are', 'been', 'be', 'have', 'has', 'had', 'do',
    'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might',
    'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he',
    'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where',
    'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
    'other', 'some', 'such', 'very', 'just', 'too', 'now', 'about', 'into',
    'through', 'during', 'before', 'after', 'above', 'below', 'from', 'up',
    'down', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
    'once', 'also', 'only', 'not', 'its', 'with', 'so', 'if', 'as', 'than',
    'no', 'nor', 'between', 'any', 'here', 'there', 'much', 'many', 'well',
    'get', 'got', 'like', 'make', 'made', 'even', 'still', 'own', 'same',
    'while', 'because', 'being', 'since', 'their', 'our', 'your', 'my',
    'his', 'her', 'him', 'me', 'us', 'them',
]);

// ─── TOKENIZATION ───

function tokenizeWords(text: string): string[] {
    return text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Sentence splitter that handles note-style content (bullets, headings, blocks).
 */
function splitSentences(text: string): string[] {
    if (!text) return [];
    const cleaned = text
        .replace(/^#{1,6}\s+/gm, '')        // strip heading markers
        .replace(/^\[[ x]\]\s*/gim, '')      // strip checkboxes
        .replace(/^[-*+]\s+/gm, '')          // strip list bullets
        .replace(/^>\s+/gm, '')              // strip blockquote
        .replace(/^\d+\.\s+/gm, '')          // strip numbered list
        .replace(/\(([a-z]+)(?:\s+.*?)?\)/gi, '') // strip block tags
        .replace(/Mr\./g, 'Mr').replace(/Mrs\./g, 'Mrs')
        .replace(/Dr\./g, 'Dr').replace(/vs\./g, 'vs')
        .replace(/e\.g\./g, 'eg').replace(/i\.e\./g, 'ie');

    const lines = cleaned.split(/\n/).map(l => l.trim()).filter(l => l.length > 3);
    const sentences: string[] = [];

    for (const line of lines) {
        const sub = line.split(/(?<=[.!?])\s+/).filter(s => s.length > 3);
        if (sub.length > 0) sentences.push(...sub);
        else sentences.push(line);
    }
    return sentences;
}

// ─── STEP 1: AGGRESSIVE PREPROCESSING ───

function preprocessSentences(text: string): { text: string; index: number }[] {
    const raw = splitSentences(text);
    const valid: { text: string; index: number }[] = [];

    for (let i = 0; i < raw.length; i++) {
        const s = raw[i].trim();
        const wc = s.split(/\s+/).length;

        // Skip fragments (too short to be meaningful)
        if (wc < 6) continue;

        // Skip rambling (too long to be a clean summary sentence)
        if (wc > 60) continue;

        // Skip questions (not summary material)
        if (s.endsWith('?')) continue;

        // Skip sentences that are mostly numbers
        const words = s.split(/\s+/);
        const numberCount = words.filter(w => /^\d+/.test(w)).length;
        if (numberCount / words.length > 0.4) continue;

        // Skip "for example" / "for instance" (supporting detail)
        if (/^(for example|for instance|such as|e\.?g\.?)/i.test(s)) continue;

        valid.push({ text: s, index: i });
    }

    return valid;
}

// ─── STEP 2: TF-IDF (REAL IDF) ───

function calculateWordScores(sentences: { text: string }[]): Record<string, number> {
    const allWords: string[] = [];
    const sentenceWordSets: Set<string>[] = [];

    for (const s of sentences) {
        const words = tokenizeWords(s.text);
        allWords.push(...words);
        sentenceWordSets.push(new Set(words));
    }

    // Word frequency
    const freq: Record<string, number> = {};
    for (const w of allWords) freq[w] = (freq[w] || 0) + 1;

    const totalWords = allWords.length || 1;
    const n = sentences.length;
    const scores: Record<string, number> = {};

    for (const word of Object.keys(freq)) {
        // TF: frequency relative to total words
        const tf = freq[word] / totalWords;

        // IDF: log(total sentences / sentences containing this word)
        let docCount = 0;
        for (const ws of sentenceWordSets) {
            if (ws.has(word)) docCount++;
        }
        const idf = Math.log((n + 1) / (docCount + 1)) + 1; // smoothed IDF

        scores[word] = tf * idf;
    }

    return scores;
}

// ─── STEP 3: SENTENCE SCORING ───

interface ScoredSentence {
    text: string;
    score: number;
    index: number;   // original position in document
    wordCount: number;
}

function scoreSentences(
    sentences: { text: string; index: number }[],
    wordScores: Record<string, number>
): ScoredSentence[] {
    return sentences.map((s) => {
        const words = tokenizeWords(s.text);
        if (words.length === 0) return { text: s.text, score: 0, index: s.index, wordCount: 0 };

        // Sum of TF-IDF scores for words in this sentence
        let sum = 0;
        for (const w of words) sum += wordScores[w] || 0;

        // CRITICAL: Normalize by word count (prevents long sentences from dominating)
        let score = sum / words.length;

        // Mild position bonus — first sentence slightly more important
        if (s.index === 0) score *= 1.15;
        else if (s.index <= 2) score *= 1.05;

        return { text: s.text, score, index: s.index, wordCount: words.length };
    });
}

// ─── STEP 4: JACCARD SIMILARITY ───

function jaccardSimilarity(a: string, b: string): number {
    const setA = new Set(tokenizeWords(a));
    const setB = new Set(tokenizeWords(b));
    if (setA.size === 0 && setB.size === 0) return 1;

    let intersection = 0;
    for (const w of setA) if (setB.has(w)) intersection++;

    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
}

// ─── STEP 5: MMR SELECTION (REDUNDANCY REMOVAL) ───

function selectWithMMR(
    scored: ScoredSentence[],
    targetCount: number,
    lambda: number = 0.7,
): ScoredSentence[] {
    if (scored.length === 0) return [];

    // Sort by score descending
    const sorted = [...scored].sort((a, b) => b.score - a.score);

    // Only consider top 30% (70th percentile threshold)
    const cutoff = Math.max(targetCount * 2, Math.ceil(sorted.length * 0.3));
    const candidates = sorted.slice(0, cutoff);

    // MMR: iteratively select the best sentence that balances relevance + diversity
    const selected: ScoredSentence[] = [candidates[0]];
    const remaining = candidates.slice(1);

    while (selected.length < targetCount && remaining.length > 0) {
        let bestIdx = -1;
        let bestMMR = -Infinity;

        for (let i = 0; i < remaining.length; i++) {
            const candidate = remaining[i];

            // Max similarity to any already-selected sentence
            let maxSim = 0;
            for (const sel of selected) {
                const sim = jaccardSimilarity(candidate.text, sel.text);
                if (sim > maxSim) maxSim = sim;
            }

            // If >55% similar to something already selected, skip entirely
            if (maxSim > 0.55) continue;

            // MMR = λ * relevance - (1-λ) * similarity
            const mmr = lambda * candidate.score - (1 - lambda) * maxSim;

            if (mmr > bestMMR) {
                bestMMR = mmr;
                bestIdx = i;
            }
        }

        if (bestIdx === -1) break; // all remaining are too similar
        selected.push(remaining[bestIdx]);
        remaining.splice(bestIdx, 1);
    }

    // Re-sort by original document position for natural flow
    selected.sort((a, b) => a.index - b.index);
    return selected;
}

// ─── STEP 6: SENTENCE COMPRESSION ───

function compressSentence(s: string): string {
    let c = s;
    // Remove introductory transitions
    c = c.replace(/^(However|Moreover|Furthermore|Additionally|In addition|Therefore|Thus|Hence|Meanwhile|Consequently|Nevertheless),?\s+/i, '');
    // Remove relative clauses (which/that + clause)
    c = c.replace(/,?\s+which\s+[^,]{3,40},?/gi, '');
    // Remove parenthetical asides
    c = c.replace(/\s*\([^)]{3,60}\)\s*/g, ' ');
    // Simplify "in order to" → "to"
    c = c.replace(/in order to/gi, 'to');
    c = c.replace(/due to the fact that/gi, 'because');
    // Remove hedging
    c = c.replace(/\b(basically|essentially|literally|actually|really|quite|rather|somewhat|perhaps|possibly|probably)\s+/gi, '');
    // Clean up whitespace
    c = c.replace(/\s+/g, ' ').trim();
    // Ensure ends with period
    if (c.length > 0 && !/[.!?]$/.test(c)) c += '.';
    return c;
}

// ─── MAIN SUMMARIZER ───

function summarize(text: string, targetSentences: number): string[] {
    // Step 1: Aggressive preprocessing
    const validSentences = preprocessSentences(text);

    if (validSentences.length === 0) {
        // Fallback: just grab any sentence
        const raw = splitSentences(text);
        if (raw.length === 0) return [''];
        return [compressSentence(raw[0])];
    }

    if (validSentences.length <= targetSentences) {
        return validSentences.map(s => compressSentence(s.text));
    }

    // Step 2: TF-IDF word importance
    const wordScores = calculateWordScores(validSentences);

    // Step 3: Score every sentence
    const scored = scoreSentences(validSentences, wordScores);

    // Step 4: MMR selection (best sentences with redundancy removal)
    const selected = selectWithMMR(scored, targetSentences);

    // Step 5: Compress each selected sentence
    return selected.map(s => compressSentence(s.text));
}

// ─── KEYWORD EXTRACTION ───

function getKeywords(text: string, count: number = 5): string[] {
    const words = tokenizeWords(text);
    const freq: Record<string, number> = {};
    for (const w of words) freq[w] = (freq[w] || 0) + 1;
    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, count)
        .map(e => e[0]);
}

function suggestTitle(text: string): string {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);
    if (lines.length === 0) return 'Untitled';

    const headingMatch = text.match(/^#+\s+(.*)/m);
    if (headingMatch?.[1]) return headingMatch[1].trim();

    const sentences = splitSentences(text).slice(0, 3);
    if (sentences.length === 0) return lines[0].slice(0, 40);

    const keywords = getKeywords(text, 10);
    let bestPhrase = sentences[0];
    let maxKw = 0;

    for (const s of sentences) {
        const ws = new Set(tokenizeWords(s));
        let c = 0;
        for (const k of keywords) if (ws.has(k)) c++;
        if (c > maxKw) { maxKw = c; bestPhrase = s; }
    }

    let title = bestPhrase.split(/[.!?]/)[0].trim();
    if (title.length > 50) title = title.slice(0, 47) + '...';
    return title;
}

// ─── WORKER MESSAGE HANDLER ───

self.onmessage = (e: MessageEvent) => {
    const { id, action, payload } = e.data;

    try {
        let result;

        switch (action) {
            case 'generateEmbedding':
                result = new Array(384).fill(0);
                break;

            case 'summarizeNote': {
                const text = payload.text || '';
                const rawCount = splitSentences(text).length;

                // Target counts: aggressive compression
                // 1 sentence for one-line
                // 2-3 for short (max 20% of original, capped at 3)
                // 3-5 for detailed (max 25% of original, capped at 5)
                const oneLineCount = 1;
                const shortCount = Math.max(2, Math.min(3, Math.ceil(rawCount * 0.15)));
                const detailedCount = Math.max(3, Math.min(5, Math.ceil(rawCount * 0.2)));

                result = {
                    oneLine: summarize(text, oneLineCount).join(' '),
                    short: summarize(text, shortCount).join(' '),
                    detailed: summarize(text, detailedCount).join(' '),
                };
                break;
            }

            case 'suggestTitle':
                result = suggestTitle(payload.text || '');
                break;

            case 'extractKeywords':
                result = getKeywords(payload.text || '', 5);
                break;

            case 'detectPriority': {
                const text = (payload.text || '').toLowerCase();
                const urgentWords = ['urgent', 'asap', 'immediately', 'critical', 'important', '!!!', 'deadline'];
                result = urgentWords.some(w => text.includes(w)) ? 'high' : 'low';
                break;
            }

            case 'readability': {
                const text = payload.text || '';
                const sentenceCount = splitSentences(text).length || 1;
                const wordCount = text.split(/\s+/).filter((w: string) => w.length > 0).length || 1;
                const syllables = text.replace(/[^aeiouy]/gi, '').length;
                const score = 0.39 * (wordCount / sentenceCount) + 11.8 * (syllables / wordCount) - 15.59;
                result = {
                    grade: Math.max(1, Math.min(16, Math.round(score))),
                    readingEase: 206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllables / wordCount),
                };
                break;
            }

            case 'askNotes': {
                const { query, notes } = payload;
                const queryWords = new Set(tokenizeWords(query));
                let bestMatch = { snippet: "I couldn't find a direct answer in your notes.", noteId: '' };
                let maxScore = 0;

                for (const note of notes) {
                    const sentences = splitSentences(note.content);
                    for (const s of sentences) {
                        const sWords = new Set(tokenizeWords(s));
                        let overlap = 0;
                        for (const w of queryWords) if (sWords.has(w)) overlap++;
                        const score = overlap / (Math.log(queryWords.size + 1) + Math.log(sWords.size + 1));
                        if (score > maxScore) {
                            maxScore = score;
                            bestMatch = { snippet: s, noteId: note.id };
                        }
                    }
                }
                result = bestMatch;
                break;
            }

            default:
                throw new Error(`Unknown action: ${action}`);
        }

        self.postMessage({ id, result });
    } catch (error) {
        self.postMessage({ id, error: (error as Error).message });
    }
};
