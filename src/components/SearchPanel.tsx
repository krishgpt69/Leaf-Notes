import { useState, useMemo, useDeferredValue } from 'react';
import { useStore } from '../lib/store';
import { Search, Tag } from 'lucide-react';
import { truncate, relativeTime } from '../lib/utils';

export default function SearchPanel() {
    const notes = useStore((s) => s.notes);
    const folders = useStore((s) => s.folders);
    const setActiveNoteId = useStore((s) => s.setActiveNoteId);
    const [query, setQuery] = useState('');
    const deferredQuery = useDeferredValue(query);

    // Simple keyword search combined with tags and folder filters
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedFolder, setSelectedFolder] = useState<string>('all');

    // Extract all unique tags
    const allTags = useMemo(() => {
        const tags = new Set<string>();
        notes.forEach((n) => n.tags.forEach((t) => tags.add(t)));
        return Array.from(tags).sort();
    }, [notes]);

    const handleSemanticSearch = async () => {
        // Semantic search is currently disabled without an embeddings provider
        // Fallback to purely local keyword search implemented in filteredNotes
    };

    const filteredNotes = useMemo(() => {
        return notes.filter(n => {
            if (n.trashed) return false;
            if (selectedFolder !== 'all' && n.folderId !== selectedFolder) return false;
            if (selectedTags.length > 0 && !selectedTags.every(t => n.tags.includes(t))) return false;
            if (deferredQuery.trim()) {
                const q = deferredQuery.toLowerCase();
                return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
            }
            return true;
        });
    }, [notes, deferredQuery, selectedFolder, selectedTags]);

    const isFiltering = query !== deferredQuery;

    const toggleTag = (tag: string) => {
        setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    };

    return (
        <div className="search-panel animate-in acrylic">
            <div className="search-header">
                <h2 className="search-title">Advanced Search</h2>
                <p className="search-subtitle">Find notes by content, semantics, folders, or tags.</p>
            </div>

            <div className="search-controls">
                <div className="search-input-wrapper">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search ideas, concepts..."
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSemanticSearch();
                        }}
                    />
                </div>

                <div className="filters-row">
                    <select
                        className="filter-select"
                        value={selectedFolder}
                        onChange={(e) => setSelectedFolder(e.target.value)}
                    >
                        <option value="all">All Folders</option>
                        {folders.map(f => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                    </select>
                </div>

                {allTags.length > 0 && (
                    <div className="tags-filter">
                        <div className="tags-filter-label"><Tag size={12} /> Filter by Tags:</div>
                        <div className="tags-list">
                            {allTags.map(tag => (
                                <button
                                    key={tag}
                                    className={`filter-tag ${selectedTags.includes(tag) ? 'active' : ''}`}
                                    onClick={() => toggleTag(tag)}
                                >
                                    #{tag}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="search-results">
                {isFiltering && (
                    <div className="search-status">Filtering results…</div>
                )}
                {filteredNotes.length === 0 ? (
                    <div className="empty-results">No notes found matching your criteria.</div>
                ) : (
                    <div className="results-grid">
                        {filteredNotes.map(note => (
                            <div
                                key={note.id}
                                className="result-card"
                                onClick={() => setActiveNoteId(note.id)}
                            >
                                <h4 className="result-title">{note.title || 'Untitled'}</h4>
                                <p className="result-preview">{truncate(note.content, 120)}</p>
                                <div className="result-meta">
                                    <span>{relativeTime(note.updatedAt)}</span>
                                    {note.category && <span>· {note.category}</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <style>{`
        .search-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 40px 60px;
          height: 100%;
          overflow: hidden;
        }
        .search-header {
           margin-bottom: 32px;
        }
        .search-title {
           font-family: var(--font-display);
           font-size: 32px;
           color: var(--color-text-1);
           font-style: italic;
           font-weight: 400;
           margin-bottom: 8px;
        }
        .search-subtitle {
           color: var(--color-text-3);
           font-size: var(--text-sm);
        }
        .search-controls {
            display: flex;
            flex-direction: column;
            gap: 16px;
            margin-bottom: 32px;
        }
        .search-input-wrapper {
            position: relative;
            display: flex;
            align-items: center;
        }
        .search-icon {
            position: absolute;
            left: 16px;
            color: var(--color-text-4);
        }
        .search-input {
            width: 100%;
            height: 52px;
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-lg);
            padding: 0 48px;
            font-size: 16px;
            color: var(--color-text-1);
            font-family: var(--font-ui);
            transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
        }
        .search-input:focus {
            outline: none;
            border-color: var(--color-accent);
            box-shadow: 0 0 0 3px var(--color-accent-light);
        }
        .search-spinner {
            position: absolute;
            right: 16px;
            color: var(--color-accent);
        }
        .filters-row {
            display: flex;
            gap: 12px;
        }
        .filter-select {
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            color: var(--color-text-2);
            padding: 8px 12px;
            border-radius: var(--radius-md);
            font-family: var(--font-ui);
            font-size: var(--text-sm);
            outline: none;
        }
        .filter-select:focus {
            border-color: var(--color-accent);
        }
        .tags-filter {
            background: var(--color-surface-2);
            padding: 16px;
            border-radius: var(--radius-lg);
        }
        .tags-filter-label {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            color: var(--color-text-4);
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .tags-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .filter-tag {
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            color: var(--color-text-3);
            padding: 4px 10px;
            border-radius: var(--radius-full);
            font-size: 12px;
            cursor: pointer;
            transition: background-color var(--dur-fast), color var(--dur-fast), border-color var(--dur-fast);
        }
        .filter-tag:hover {
            border-color: var(--color-border-strong);
            color: var(--color-text-2);
        }
        .filter-tag.active {
            background: var(--color-accent-light);
            border-color: var(--color-accent);
            color: var(--color-accent);
        }
        .search-results {
            flex: 1;
            overflow-y: auto;
            padding-bottom: 40px;
        }
        .search-status {
            font-size: 12px;
            color: var(--color-text-4);
            margin-bottom: 12px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }
        .empty-results {
            text-align: center;
            padding: 40px;
            color: var(--color-text-4);
            font-style: italic;
        }
        .results-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 16px;
        }
        .result-card {
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-lg);
            padding: 20px;
            cursor: pointer;
            transition: transform var(--dur-fast), box-shadow var(--dur-fast), border-color var(--dur-fast);
        }
        .result-card:hover {
            transform: translateY(-2px);
            box-shadow: var(--shadow-sm);
            border-color: var(--color-border-strong);
        }
        .result-title {
            font-size: 15px;
            font-weight: 600;
            color: var(--color-text-1);
            margin: 0 0 8px 0;
        }
        .result-preview {
            font-size: 13px;
            color: var(--color-text-3);
            line-height: 1.5;
            margin: 0 0 16px 0;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .result-meta {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 11px;
            color: var(--color-text-4);
        }
      `}</style>
        </div>
    );
}
