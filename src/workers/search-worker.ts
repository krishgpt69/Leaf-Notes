/* ═══════════════════════════════════════════════════════════════
   🍃 Leaf Search Worker — MiniSearch in Web Worker
   ═══════════════════════════════════════════════════════════════ */

import MiniSearch from 'minisearch';

interface NoteDoc {
    id: string;
    title: string;
    content: string;
    folderId: string;
    tags: string[];
}

const miniSearch = new MiniSearch<NoteDoc>({
    fields: ['title', 'content', 'tags'],
    storeFields: ['title', 'folderId'],
    searchOptions: {
        boost: { title: 3, tags: 2 },
        fuzzy: 0.2,
        prefix: true,
    },
});

type WorkerMessage =
    | { type: 'index-all'; notes: NoteDoc[] }
    | { type: 'add'; note: NoteDoc }
    | { type: 'update'; note: NoteDoc }
    | { type: 'remove'; id: string }
    | { type: 'search'; query: string; requestId: string };

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const msg = e.data;

    switch (msg.type) {
        case 'index-all':
            miniSearch.removeAll();
            miniSearch.addAll(msg.notes);
            self.postMessage({ type: 'indexed', count: msg.notes.length });
            break;

        case 'add':
            try { miniSearch.add(msg.note); } catch { /* duplicate */ }
            break;

        case 'update':
            try {
                miniSearch.discard(msg.note.id);
            } catch { /* not found */ }
            miniSearch.add(msg.note);
            break;

        case 'remove':
            try { miniSearch.discard(msg.id); } catch { /* not found */ }
            break;

        case 'search': {
            const results = msg.query.trim()
                ? miniSearch.search(msg.query, { fuzzy: 0.2, prefix: true })
                : [];
            self.postMessage({
                type: 'results',
                requestId: msg.requestId,
                results: results.map((r) => {
                    const doc = r as unknown as NoteDoc;
                    return {
                        id: r.id,
                        title: doc.title,
                        folderId: doc.folderId,
                        score: r.score,
                        match: r.match,
                    };
                }),
            });
            break;
        }
    }
};
