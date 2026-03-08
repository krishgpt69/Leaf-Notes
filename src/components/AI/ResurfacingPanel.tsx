import { useState, useEffect, useRef, memo } from 'react';
import { Lightbulb, X, FileText, ArrowRight } from 'lucide-react';
import { useStore } from '../../lib/store';
import { findRelevantNotes, type SurfacedNote } from '../../lib/resurfacer';

function ResurfacingPanelInner() {
    const notes = useStore(s => s.notes);
    const activeNoteId = useStore(s => s.activeNoteId);
    const setActiveNoteId = useStore(s => s.setActiveNoteId);

    const [suggestions, setSuggestions] = useState<SurfacedNote[]>([]);
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());
    const [hidden, setHidden] = useState(false);

    const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const prevContentRef = useRef<string>('');

    const activeNote = notes.find(n => n.id === activeNoteId);

    useEffect(() => {
        if (!activeNote || activeNote.trashed || (activeNote.wordCount || 0) < 20) {
            const clearId = window.setTimeout(() => {
                setSuggestions([]);
            }, 0);
            return () => window.clearTimeout(clearId);
        }

        if (activeNote.content === prevContentRef.current) return;
        prevContentRef.current = activeNote.content;

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            const results = findRelevantNotes(activeNote, notes, 3);
            const filtered = results.filter(r => !dismissed.has(r.noteId));
            setSuggestions(filtered);
            setHidden(false);
        }, 5000);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [activeNote, dismissed, notes]);

    useEffect(() => {
        const resetId = window.setTimeout(() => {
            setSuggestions([]);
            setDismissed(new Set());
            setHidden(false);
            prevContentRef.current = '';
        }, 0);
        return () => window.clearTimeout(resetId);
    }, [activeNoteId]);

    if (hidden || suggestions.length === 0) return null;

    return (
        <div className="resurfacing-panel">
            <div className="resurfacing-header">
                <Lightbulb size={12} className="resurfacing-icon" />
                <span>Related Notes</span>
                <button className="resurfacing-close" onClick={() => setHidden(true)}>
                    <X size={12} />
                </button>
            </div>
            <div className="resurfacing-list">
                {suggestions.map(s => (
                    <button
                        key={s.noteId}
                        className="resurfacing-item"
                        onClick={() => setActiveNoteId(s.noteId)}
                    >
                        <FileText size={12} className="resurfacing-item-icon" />
                        <div className="resurfacing-item-info">
                            <span className="resurfacing-item-title">{s.title}</span>
                            <span className="resurfacing-item-reason">{s.reason}</span>
                        </div>
                        <ArrowRight size={10} className="resurfacing-arrow" />
                    </button>
                ))}
            </div>
        </div>
    );
}

export default memo(ResurfacingPanelInner);
