import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { Hash, FileText, ChevronRight, Sparkles, AlertCircle } from 'lucide-react';

export default function TagsPanel() {
  const notes = useStore((s) => s.notes);
  const setActiveNoteId = useStore((s) => s.setActiveNoteId);
  const setActiveSection = useStore((s) => s.setActiveSection);

  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Build tag & category index from all notes
  const tagIndex = useMemo(() => {
    const index = new Map<string, { count: number; noteIds: string[]; type: 'manual' | 'ai' }>();
    for (const note of notes) {
      if (note.trashed) continue;

      // Manual tags
      for (const tag of note.tags) {
        const entry = index.get(tag) || { count: 0, noteIds: [], type: 'manual' };
        entry.count++;
        entry.noteIds.push(note.id);
        index.set(tag, entry);
      }

      // AI Category as a "Smart Tag"
      if (note.category && note.category !== 'Uncategorized') {
        const catStr = `✧ ${note.category}`;
        const entry = index.get(catStr) || { count: 0, noteIds: [], type: 'ai' };
        entry.count++;
        entry.noteIds.push(note.id);
        index.set(catStr, entry);
      }
    }
    // Sort by type (AI first) then count descending
    return [...index.entries()].sort((a, b) => {
      if (a[1].type !== b[1].type) {
        return a[1].type === 'ai' ? -1 : 1;
      }
      return b[1].count - a[1].count;
    });
  }, [notes]);

  const filteredNotes = useMemo(() => {
    if (!selectedTag) return [];
    const entry = tagIndex.find(([tag]) => tag === selectedTag);
    if (!entry) return [];
    return notes.filter((n) => entry[1].noteIds.includes(n.id));
  }, [selectedTag, tagIndex, notes]);

  return (
    <div className="tags-panel animate-in">
      <div className="intel-premium-header" style={{ padding: '32px 32px 0' }}>
        <h1 className="intel-premium-title" style={{ fontSize: '48px' }}>Tags</h1>
        <p className="intel-premium-subtitle">Manage your taxonomy. <span className="intel-date" style={{ marginLeft: 8 }}>{tagIndex.length} tags</span></p>
      </div>

      <div className="tags-panel-body">
        {/* Tag Cloud */}
        <div className="tags-cloud-section">
          {tagIndex.length === 0 ? (
            <div className="tags-empty">
              <Hash size={40} strokeWidth={1.5} />
              <h3>No tags yet</h3>
              <p>
                Add <code>#tags</code> to your notes and they'll appear here.
              </p>
            </div>
          ) : (
            <div className="tags-cloud">
              {tagIndex.map(([tag, data], i) => (
                <button
                  key={tag}
                  className={`tag-chip ${selectedTag === tag ? 'active' : ''} ${data.type === 'ai' ? 'ai-tag' : ''}`}
                  style={{ animation: 'intelFadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) backwards', animationDelay: `${0.1 + i * 0.02}s` }}
                  onClick={() =>
                    setSelectedTag(selectedTag === tag ? null : tag)
                  }
                >
                  {data.type === 'ai' ? <Sparkles size={12} /> : <Hash size={13} />}
                  <span>{data.type === 'ai' ? tag.replace('✧ ', '') : tag}</span>
                  <span className="tag-chip-count">{data.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filtered notes */}
        {selectedTag && (
          <div className="tags-notes-section">
            <div className="tags-notes-header">
              <Hash size={14} />
              <span>{selectedTag}</span>
              <ChevronRight size={12} />
              <span className="tags-notes-count">
                {filteredNotes.length} notes
              </span>
            </div>
            <div className="tags-notes-list">
              {filteredNotes.map((note, i) => (
                <button
                  key={note.id}
                  className="tags-note-item"
                  style={{ animation: 'intelFadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) backwards', animationDelay: `${0.2 + i * 0.05}s` }}
                  onClick={() => {
                    setActiveNoteId(note.id);
                    setActiveSection('notes');
                  }}
                >
                  <FileText size={14} />
                  <span className="tags-note-title">
                    {note.title || 'Untitled'}
                    {note.priority === 'high' && <AlertCircle size={12} className="inline-priority-icon" color="var(--color-red)" />}
                  </span>
                  <span className="tags-note-date">
                    {new Date(note.updatedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .tags-panel {
          flex: 1;
          height: 100%;
          display: flex;
          flex-direction: column;
          border-radius: var(--radius-lg);
          min-width: 0;
          overflow: hidden;
        }
        .tags-panel-body {
          flex: 1;
          overflow-y: auto;
          padding: 16px 32px 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .tags-cloud-section {
          width: 100%;
          max-width: 600px;
        }

        /* Empty state */
        .tags-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 120px 40px;
          text-align: center;
          color: var(--color-text-3);
        }
        .tags-empty h3 {
          font-size: var(--text-lg);
          color: var(--color-text-2);
          font-weight: 500;
        }
        .tags-empty p {
          font-size: var(--text-md);
          line-height: 1.5;
        }
        .tags-empty code {
          background: var(--color-surface-2);
          padding: 2px 6px;
          border-radius: var(--radius-sm);
          font-family: var(--font-mono);
          color: var(--color-accent);
          font-size: var(--text-sm);
        }

        /* Tag cloud */
        .tags-cloud {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .tag-chip {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 8px 16px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-full);
          background: var(--color-surface-2);
          color: var(--color-text-2);
          font-size: var(--text-sm);
          font-family: var(--font-ui);
          cursor: pointer;
          backdrop-filter: blur(var(--glass-blur));
          -webkit-backdrop-filter: blur(var(--glass-blur));
          transition: background-color var(--dur-fast) var(--spring-snappy),
            color var(--dur-fast) var(--spring-snappy),
            border-color var(--dur-fast) var(--spring-snappy),
            box-shadow var(--dur-fast) var(--spring-snappy),
            transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .tag-chip:hover {
          border-color: var(--color-accent);
          color: var(--color-accent);
          background: var(--color-accent-light);
          transform: translateY(-2px);
        }
        .tag-chip.active {
          border-color: var(--color-accent);
          background: var(--color-accent);
          color: white;
        }
        .tag-chip.ai-tag {
            border-color: var(--color-teal);
            color: var(--color-teal);
            background: var(--color-teal-light);
        }
        .tag-chip.ai-tag:hover {
            background: var(--color-teal);
            color: white;
        }
        .tag-chip.ai-tag.active {
            background: var(--color-teal);
            color: white;
            box-shadow: 0 0 12px var(--color-teal-light);
        }
        .tag-chip-count {
          font-size: var(--text-xs);
          opacity: 0.7;
          min-width: 14px;
          text-align: center;
        }

        /* Filtered notes */
        .tags-notes-section {
          margin-top: 24px;
          border-top: 1px solid var(--color-border);
          padding-top: 16px;
          width: 100%;
          max-width: 600px;
        }
        .tags-notes-header {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: var(--text-sm);
          color: var(--color-accent);
          font-weight: 500;
          margin-bottom: 12px;
        }
        .tags-notes-count {
          color: var(--color-text-3);
          font-weight: 400;
        }
        .tags-notes-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .tags-note-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border: none;
          background: transparent;
          color: var(--color-text-2);
          font-size: var(--text-sm);
          font-family: var(--font-ui);
          border-radius: var(--radius-md);
          cursor: pointer;
          text-align: left;
          transition: background var(--dur-fast);
          width: 100%;
        }
        .tags-note-item:hover {
          background: var(--color-surface-2);
        }
        .tags-note-title {
          flex: 1;
          font-weight: 500;
          color: var(--color-text-1);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .inline-priority-icon {
            flex-shrink: 0;
            display: inline-block;
        }
        .tags-note-date {
          font-size: var(--text-xs);
          color: var(--color-text-3);
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}
