import { useEffect, useRef, useCallback, useState } from 'react';
import { EditorState, Annotation } from '@codemirror/state';
import { EditorView, keymap, drawSelection, dropCursor, highlightActiveLine, highlightSpecialChars, type ViewUpdate } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle, HighlightStyle } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap, autocompletion, CompletionContext } from '@codemirror/autocomplete';
import type { CompletionResult, Completion } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { tags } from '@lezer/highlight';

import { MatchDecorator, ViewPlugin, Decoration } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { useStore } from '../../lib/store';

/* ═══════════════════════════════════════════════════════════════
   🍃 Leaf Editor Hook — CodeMirror 6
   ═══════════════════════════════════════════════════════════════ */

// Autocomplete logic for [[Wikilinks]]
const wikilinkCompletion = (context: CompletionContext): CompletionResult | null => {
    // Match `[[` followed by anything except `]`
    const word = context.matchBefore(/\[\[[^\]]*/);
    if (!word) return null;
    if (word.from === word.to && !context.explicit) return null;

    const searchTerm = word.text.slice(2).toLowerCase();
    const notes = useStore.getState().notes;

    const options = notes
        .filter(n => !n.trashed && n.title && n.title.toLowerCase().includes(searchTerm))
        .map(n => ({
            label: n.title,
            type: 'keyword',
            detail: 'Note',
            apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
                // Determine if a closing bracket already exists right after the cursor
                const nextChar = view.state.sliceDoc(to, to + 2);
                const hasClosing = nextChar === ']]';
                const insertText = hasClosing ? `[[${n.title}` : `[[${n.title}]]`;

                view.dispatch({
                    changes: { from, to, insert: insertText },
                    selection: { anchor: from + insertText.length }
                });
            }
        }));

    return {
        from: word.from,
        options,
        validFor: /^\[\[[^\]]*$/
    };
};

// Custom decorator for [[Wikilinks]]
const wikilinkDecorator = new MatchDecorator({
    regexp: /\[\[(.*?)\]\]/g,
    decoration: Decoration.mark({ class: 'cm-wikilink' })
});

const wikilinkPlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
        this.decorations = wikilinkDecorator.createDeco(view);
    }
    update(update: ViewUpdate) {
        this.decorations = wikilinkDecorator.updateDeco(update, this.decorations);
    }
}, {
    decorations: v => v.decorations
});

const programmaticChange = Annotation.define<boolean>();

const leafHighlightStyle = HighlightStyle.define([
    { tag: tags.heading1, fontSize: '1.875rem', fontWeight: '700', color: 'var(--color-text-1)', lineHeight: '1.3' },
    { tag: tags.heading2, fontSize: '1.375rem', fontWeight: '600', color: 'var(--color-text-1)', lineHeight: '1.3' },
    { tag: tags.heading3, fontSize: '1.125rem', fontWeight: '600', color: 'var(--color-text-2)', lineHeight: '1.4' },
    { tag: tags.strong, fontWeight: '700', color: 'var(--color-text-1)' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through', opacity: '0.6' },
    { tag: tags.link, color: 'var(--color-accent)', textDecoration: 'none' },
    { tag: tags.url, color: 'var(--color-accent)', opacity: '0.7' },
    { tag: tags.monospace, fontFamily: 'var(--font-mono)', fontSize: '0.875em', background: 'var(--color-code-bg)', padding: '2px 5px', borderRadius: '3px' },
    { tag: tags.quote, color: 'var(--color-text-3)', fontStyle: 'italic' },
    { tag: tags.list, color: 'var(--color-text-2)' },
    { tag: tags.meta, color: 'var(--color-text-3)' },
    { tag: tags.processingInstruction, color: 'var(--color-accent)' },
]);

const leafEditorTheme = EditorView.theme({
    '&': {
        fontSize: 'var(--editor-body)',
        fontFamily: 'var(--font-editor)',
        color: 'var(--color-text-2)',
        backgroundColor: 'transparent',
    },
    '.cm-content': {
        fontFamily: 'var(--font-editor)',
        lineHeight: 'var(--editor-lh)',
        padding: '8px 0',
        caretColor: 'var(--color-accent)',
    },
    '&.cm-focused .cm-cursor': {
        borderLeftColor: 'var(--color-accent)',
        borderLeftWidth: '2px',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
        backgroundColor: 'var(--color-accent-light) !important',
    },
    '&.cm-focused': {
        outline: 'none',
    },
    '.cm-activeLine': {
        backgroundColor: 'transparent',
    },
    '.cm-gutters': {
        display: 'none',
    },
    '.cm-line': {
        padding: '2px 0',
    },
    '.cm-scroller': {
        overflow: 'auto',
    },
    '.cm-wikilink': {
        color: 'var(--color-accent)',
        textDecoration: 'underline',
        textDecorationStyle: 'dotted',
        textUnderlineOffset: '4px',
        fontWeight: '500',
        cursor: 'pointer',
    },
});

function buildExtensions(
    onChangeRef: React.MutableRefObject<(content: string) => void>,
    onSlashRef: React.MutableRefObject<(() => void) | undefined>
) {
    return [
        history(),
        drawSelection(),
        dropCursor(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightActiveLine(),
        highlightSpecialChars(),
        highlightSelectionMatches(),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        leafEditorTheme,
        syntaxHighlighting(leafHighlightStyle),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            indentWithTab,
        ]),
        autocompletion({
            override: [wikilinkCompletion]
        }),
        wikilinkPlugin,
        EditorView.updateListener.of((update: ViewUpdate) => {
            if (update.docChanged) {
                if (update.transactions.some(t => t.annotation(programmaticChange))) return;
                const doc = update.state.doc.toString();
                onChangeRef.current(doc);

                // Detection logic for "/"
                const cursors = update.state.selection.ranges;
                if (cursors.length === 1 && cursors[0].empty) {
                    const pos = cursors[0].head;
                    const charBefore = update.state.sliceDoc(pos - 1, pos);
                    if (charBefore === '/') {
                        onSlashRef.current?.();
                    }
                }
            }
        }),
        EditorView.lineWrapping,
    ];
}

interface UseEditorOptions {
    onChange: (content: string) => void;
    onSlash?: () => void;
}

export function useEditor({ onChange, onSlash }: UseEditorOptions) {
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const onSlashRef = useRef(onSlash);

    const [ready, setReady] = useState(false);

    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
        onSlashRef.current = onSlash;
    }, [onSlash]);

    // Callback ref — fires the moment React attaches the DOM node
    const containerRef = useCallback(
        (node: HTMLDivElement | null) => {
            // Cleanup previous view
            if (viewRef.current) {
                viewRef.current.destroy();
                viewRef.current = null;
                setReady(false);
            }

            if (!node) return;

            const state = EditorState.create({
                doc: '',
                extensions: buildExtensions(onChangeRef, onSlashRef),
            });

            const view = new EditorView({ state, parent: node });
            viewRef.current = view;
            setReady(true);
        },
        [] // Stable — never changes
    );

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (viewRef.current) {
                viewRef.current.destroy();
                viewRef.current = null;
            }
        };
    }, []);

    const setContent = useCallback((content: string) => {
        const view = viewRef.current;
        if (!view) return;
        const cur = view.state.doc.toString();
        if (cur !== content) {
            view.dispatch({
                changes: { from: 0, to: cur.length, insert: content },
                annotations: programmaticChange.of(true),
            });
        }
    }, []);

    const focus = useCallback(() => {
        const view = viewRef.current;
        if (!view) return;
        view.focus();
    }, []);

    const insertText = useCallback((text: string) => {
        const view = viewRef.current;
        if (!view) return;
        const cursors = view.state.selection.ranges;
        if (cursors.length === 1) {
            const { from, to } = cursors[0];
            // If the char before is '/', we want to replace it
            const charBefore = view.state.sliceDoc(from - 1, from);
            const finalFrom = charBefore === '/' ? from - 1 : from;

            view.dispatch({
                changes: { from: finalFrom, to, insert: text },
                selection: { anchor: finalFrom + text.length }
            });
            view.focus();
        }
    }, []);

    const getCursorCoords = useCallback(() => {
        const view = viewRef.current;
        if (!view) return null;
        const pos = view.state.selection.main.head;
        return view.coordsAtPos(pos);
    }, []);

    const getLineAtHeight = useCallback((height: number) => {
        const view = viewRef.current;
        if (!view) return null;
        return view.lineBlockAtHeight(height);
    }, []);

    const getLineBlock = useCallback((lineNo: number) => {
        const view = viewRef.current;
        if (!view) return null;
        try {
            const line = view.state.doc.line(lineNo);
            return view.lineBlockAt(line.from);
        } catch {
            return null;
        }
    }, []);

    return { containerRef, viewRef, setContent, focus, ready, insertText, getCursorCoords, getLineAtHeight, getLineBlock };
}
