import { ViewPlugin, Decoration, WidgetType, EditorView } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { db } from '../../lib/db';

/* ═══════════════════════════════════════════════════════════════
   Sticker Widget — renders sticker://id references as inline images
   ═══════════════════════════════════════════════════════════════ */

// Cache thumbnail URLs so we don't query DB on every keystroke
const thumbnailCache = new Map<string, string>();

async function resolveStickerUrl(id: string): Promise<string | null> {
    if (thumbnailCache.has(id)) return thumbnailCache.get(id)!;
    try {
        const sticker = await db.stickers.get(id);
        if (sticker) {
            thumbnailCache.set(id, sticker.thumbnailUrl);
            return sticker.thumbnailUrl;
        }
    } catch { /* ignore */ }
    return null;
}

class StickerWidget extends WidgetType {
    stickerId: string;
    alt: string;
    url: string;

    constructor(stickerId: string, alt: string, url: string) {
        super();
        this.stickerId = stickerId;
        this.alt = alt;
        this.url = url;
    }

    toDOM(): HTMLElement {
        const wrap = document.createElement('span');
        wrap.className = 'cm-sticker-widget';
        wrap.contentEditable = 'false';

        const img = document.createElement('img');
        img.src = this.url;
        img.alt = this.alt;
        img.className = 'cm-sticker-img';
        img.draggable = false;

        wrap.appendChild(img);
        return wrap;
    }

    eq(other: StickerWidget): boolean {
        return this.stickerId === other.stickerId;
    }

    ignoreEvent(): boolean {
        return false;
    }
}

// Regex to find ![alt](sticker://id) patterns
const STICKER_RE = /!\[([^\]]*)\]\(sticker:\/\/([a-f0-9-]+)\)/g;

function buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = view.state.doc.toString();

    let match;
    STICKER_RE.lastIndex = 0;
    while ((match = STICKER_RE.exec(doc)) !== null) {
        const from = match.index;
        const to = from + match[0].length;
        const alt = match[1];
        const id = match[2];

        const url = thumbnailCache.get(id);
        if (url) {
            builder.add(
                from,
                to,
                Decoration.replace({
                    widget: new StickerWidget(id, alt, url),
                })
            );
        }
    }

    return builder.finish();
}

export const stickerWidgetPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = Decoration.none;
            this.loadAndBuild(view);
        }

        update(update: { view: EditorView; docChanged: boolean; viewportChanged: boolean }) {
            if (update.docChanged || update.viewportChanged) {
                this.loadAndBuild(update.view);
            }
        }

        async loadAndBuild(view: EditorView) {
            const doc = view.state.doc.toString();
            let match;
            STICKER_RE.lastIndex = 0;
            const ids: string[] = [];
            while ((match = STICKER_RE.exec(doc)) !== null) {
                ids.push(match[2]);
            }

            // Resolve any uncached stickers
            const uncached = ids.filter((id) => !thumbnailCache.has(id));
            if (uncached.length > 0) {
                await Promise.all(uncached.map(resolveStickerUrl));
            }

            // Build decorations with resolved URLs
            this.decorations = buildDecorations(view);
            // Force a re-render if we resolved new URLs
            if (uncached.length > 0) {
                view.dispatch(); // triggers decorations update
            }
        }
    },
    {
        decorations: (v) => v.decorations,
    }
);

// Styles injected via EditorView.theme
export const stickerWidgetTheme = EditorView.theme({
    '.cm-sticker-widget': {
        display: 'inline-block',
        verticalAlign: 'middle',
        padding: '4px 2px',
        cursor: 'default',
    },
    '.cm-sticker-img': {
        maxWidth: '120px',
        maxHeight: '120px',
        objectFit: 'contain',
        borderRadius: '6px',
        filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.15))',
        transition: 'transform 150ms ease',
    },
    '.cm-sticker-img:hover': {
        transform: 'scale(1.05)',
    },
});
