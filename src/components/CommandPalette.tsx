import { useState, useEffect, useRef, useMemo } from 'react';
import { useStore } from '../lib/store';
import {
    FileText,
    Plus,
    Moon,
    Sun,
    Settings,
    Download,
    Search,
    LayoutTemplate,
    type LucideIcon
} from 'lucide-react';

const smartTemplates = [
    {
        id: 'tpl-meeting',
        label: 'Template: Meeting Notes',
        content: '# Meeting Notes\n\n**Date:** \n**Attendees:** \n\n## Agenda\n- \n\n## Action Items\n- [ ] \n',
        tags: ['meeting'],
    },
    {
        id: 'tpl-weekly',
        label: 'Template: Weekly Review',
        content: '# Weekly Review\n\n## Wins\n- \n\n## Challenges\n- \n\n## Next Week Focus\n- \n',
        tags: ['review', 'weekly'],
    },
    {
        id: 'tpl-project',
        label: 'Template: Project Plan',
        content: '# Project Plan\n\n**Goal:** \n\n## Milestones\n1. \n\n## Resources\n- \n',
        tags: ['project', 'planning'],
    },
    {
        id: 'tpl-timeblock',
        label: 'Template: Daily Time Block',
        content: '# Daily Time Block\n\n**Date:** \n\n## Schedule\n- **09:00 - 10:00:** Deep Work\n- **10:00 - 11:00:** Admin/Email\n- **11:00 - 12:00:** Meetings\n- **13:00 - 14:00:** Lunch\n- **14:00 - 16:00:** Project Work\n- **16:00 - 17:00:** Wrap up\n\n## Top 3 Priorities\n1. \n2. \n3. \n',
        tags: ['schedule', 'time-block', 'daily'],
    }
];

export default function CommandPalette() {
    const open = useStore((s) => s.commandPaletteOpen);
    const toggleCommandPalette = useStore((s) => s.toggleCommandPalette);
    const notes = useStore((s) => s.notes);
    const folders = useStore((s) => s.folders);
    const setActiveNoteId = useStore((s) => s.setActiveNoteId);
    const createNote = useStore((s) => s.createNote);
    const updateNote = useStore((s) => s.updateNote);
    const resolvedTheme = useStore((s) => s.resolvedTheme);
    const setTheme = useStore((s) => s.setTheme);
    const setActiveSection = useStore((s) => s.setActiveSection);

    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Reset on open
    useEffect(() => {
        if (open) {
            const resetId = window.setTimeout(() => {
                setQuery('');
                setSelectedIndex(0);
            }, 0);
            const raf = window.requestAnimationFrame(() => inputRef.current?.focus());
            return () => {
                window.cancelAnimationFrame(raf);
                window.clearTimeout(resetId);
            };
        }
    }, [open]);

    // Semantic Search Effect - obsolete without embeddings provider

    // Global shortcut
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                toggleCommandPalette();
            }
            if (e.key === 'Escape' && open) {
                e.preventDefault();
                toggleCommandPalette();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, toggleCommandPalette]);

    // Actions
    const actions = useMemo(
        () => [
            {
                id: 'new-note',
                label: 'New Note',
                icon: Plus,
                shortcut: '⌘N',
                action: () => {
                    createNote();
                    toggleCommandPalette();
                },
            },
            {
                id: 'toggle-theme',
                label: resolvedTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode',
                icon: resolvedTheme === 'dark' ? Sun : Moon,
                shortcut: '',
                action: () => {
                    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
                    toggleCommandPalette();
                },
            },
            {
                id: 'settings',
                label: 'Open Settings',
                icon: Settings,
                shortcut: '',
                action: () => {
                    setActiveSection('settings');
                    toggleCommandPalette();
                },
            },
            {
                id: 'import',
                label: 'Import Notes',
                icon: Download,
                shortcut: '',
                action: () => {
                    setActiveSection('import');
                    toggleCommandPalette();
                },
            },
            ...smartTemplates.map(tpl => ({
                id: tpl.id,
                label: tpl.label,
                icon: LayoutTemplate,
                shortcut: '',
                action: async () => {
                    const note = await createNote();
                    let finalContent = tpl.content;

                    if (tpl.id === 'tpl-weekly') {
                        const now = new Date();
                        const weekStart = new Date(now);
                        const day = weekStart.getDay();
                        weekStart.setDate(weekStart.getDate() - day);
                        weekStart.setHours(0, 0, 0, 0);
                        const weekEnd = new Date(weekStart);
                        weekEnd.setDate(weekStart.getDate() + 6);
                        weekEnd.setHours(23, 59, 59, 999);

                        const range = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

                        const activeNotes = notes.filter(n => !n.trashed);
                        const weekNotes = activeNotes
                            .filter(n => n.id !== note.id && new Date(n.updatedAt).getTime() >= weekStart.getTime() && new Date(n.updatedAt).getTime() <= weekEnd.getTime())
                            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
                        const totalWords = weekNotes.reduce((acc, n) => acc + (n.wordCount || 0), 0);

                        const today = new Date(now); today.setHours(0, 0, 0, 0);
                        const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
                        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

                        const grouped: Record<string, typeof weekNotes> = {};
                        for (const n of weekNotes) {
                            const d = new Date(n.updatedAt); d.setHours(0, 0, 0, 0);
                            let label: string;
                            if (d.getTime() === today.getTime()) label = 'Today';
                            else if (d.getTime() === yesterday.getTime()) label = 'Yesterday';
                            else label = `${dayNames[d.getDay()]}, ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
                            if (!grouped[label]) grouped[label] = [];
                            grouped[label].push(n);
                        }

                        const formatTime = (ts: string) => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

                        let historySection = '';
                        if (weekNotes.length === 0) {
                            historySection = '- No notes this week.\n';
                        } else {
                            for (const [dayLabel, dayNotes] of Object.entries(grouped)) {
                                historySection += `\n---\n#### ${dayLabel}\n`;
                                for (const n of dayNotes) {
                                    historySection += `- \`${formatTime(n.updatedAt)}\` — [[${n.title || 'Untitled'}]]\n`;
                                }
                            }
                        }

                        finalContent = `# Weekly Review (${range})

## This Week's Activity
**Total Notes:** ${weekNotes.length}  ·  **Total Words:** ${totalWords}

### History
${historySection}

## Wins & Achievements
- 

## Challenges & Roadblocks
- 

## Focus for Next Week
- 
`;
                    }

                    await updateNote(note.id, {
                        content: finalContent,
                        title: tpl.label.replace('Template: ', ''),
                        tags: tpl.tags
                    });
                    toggleCommandPalette();
                }
            }))
        ],
        [resolvedTheme, createNote, updateNote, setTheme, toggleCommandPalette, setActiveSection, notes]
    );

    // Search results
    const results = useMemo(() => {
        const items: Array<{
            type: 'note' | 'action';
            id: string;
            label: string;
            sublabel?: string;
            icon: LucideIcon;
            shortcut?: string;
            action: () => void;
        }> = [];

        if (!query.trim()) {
            // Show recent notes + actions
            const recentNotes = notes
                .filter((n) => !n.trashed)
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                .slice(0, 5);

            recentNotes.forEach((note) => {
                const folder = folders.find((f) => f.id === note.folderId);
                items.push({
                    type: 'note',
                    id: note.id,
                    label: note.title || 'Untitled',
                    sublabel: folder?.name || 'Inbox',
                    icon: FileText,
                    action: () => {
                        setActiveNoteId(note.id);
                        toggleCommandPalette();
                    },
                });
            });

            actions.forEach((a) => {
                items.push({
                    type: 'action',
                    id: a.id,
                    label: a.label,
                    icon: a.icon,
                    shortcut: a.shortcut,
                    action: a.action,
                });
            });
        } else {
            // Filter notes: Text matching + Semantic matching
            const q = query.toLowerCase();
            const textMatches = notes.filter(n => !n.trashed && (n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q) || n.tags.some(t => t.toLowerCase().includes(q))));
            const combinedNotes = Array.from(new Set([...textMatches]))
                .slice(0, 10);

            combinedNotes.forEach((note) => {
                const folder = folders.find((f) => f.id === note.folderId);
                items.push({
                    type: 'note',
                    id: note.id,
                    label: note.title || 'Untitled',
                    sublabel: folder?.name || 'Inbox',
                    icon: FileText,
                    action: () => {
                        setActiveNoteId(note.id);
                        toggleCommandPalette();
                    },
                });
            });

            // Filter actions
            actions
                .filter((a) => a.label.toLowerCase().includes(q))
                .forEach((a) => {
                    items.push({
                        type: 'action',
                        id: a.id,
                        label: a.label,
                        icon: a.icon,
                        shortcut: a.shortcut,
                        action: a.action,
                    });
                });
        }

        return items;
    }, [query, notes, folders, actions, setActiveNoteId, toggleCommandPalette]);

    // Keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            results[selectedIndex]?.action();
        }
    };

    // Scroll selected into view
    useEffect(() => {
        const item = listRef.current?.children[selectedIndex] as HTMLElement;
        item?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    if (!open) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="cp-backdrop"
                onClick={toggleCommandPalette}
            />

            {/* Modal */}
            <div className="cp-modal acrylic" onKeyDown={handleKeyDown}>
                {/* Search input */}
                <div className="cp-input-wrap">
                    <Search size={18} className="cp-input-icon" />
                    <input
                        ref={inputRef}
                        className="cp-input"
                        placeholder="Search notes or type a command..."
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setSelectedIndex(0);
                        }}
                    />
                </div>

                {/* Results */}
                <div className="cp-results" ref={listRef}>
                    {results.length === 0 ? (
                        <div className="cp-empty">
                            <Search size={32} />
                            <p>No results for '{query}'</p>
                            <span>Try searching by tag, folder name, or keyword</span>
                        </div>
                    ) : (
                        <>
                            {/* Group headers */}
                            {!query.trim() && results.some((r) => r.type === 'note') && (
                                <div className="cp-group-header">Recent Notes</div>
                            )}
                            {results
                                .filter((r) => r.type === 'note')
                                .map((item, idx) => (
                                    <button
                                        key={item.id}
                                        className={`cp-result-item ${selectedIndex === idx ? 'selected' : ''}`}
                                        onClick={item.action}
                                        onMouseEnter={() => setSelectedIndex(idx)}
                                    >
                                        <item.icon size={16} className="cp-result-icon" />
                                        <div className="cp-result-text">
                                            <span className="cp-result-label">{item.label}</span>
                                            {item.sublabel && (
                                                <span className="cp-result-sublabel">{item.sublabel}</span>
                                            )}
                                        </div>
                                        {item.shortcut && (
                                            <span className="cp-result-shortcut">{item.shortcut}</span>
                                        )}
                                    </button>
                                ))}
                            {results.some((r) => r.type === 'action') && (
                                <div className="cp-group-header">
                                    {query.trim() ? 'Actions' : 'Quick Actions'}
                                </div>
                            )}
                            {results
                                .filter((r) => r.type === 'action')
                                .map((item) => {
                                    const globalIdx = results.indexOf(item);
                                    return (
                                        <button
                                            key={item.id}
                                            className={`cp-result-item ${selectedIndex === globalIdx ? 'selected' : ''}`}
                                            onClick={item.action}
                                            onMouseEnter={() => setSelectedIndex(globalIdx)}
                                        >
                                            <item.icon size={16} className="cp-result-icon action-icon" />
                                            <div className="cp-result-text">
                                                <span className="cp-result-label">{item.label}</span>
                                            </div>
                                            {item.shortcut && (
                                                <span className="cp-result-shortcut">{item.shortcut}</span>
                                            )}
                                        </button>
                                    );
                                })}
                        </>
                    )}
                </div>
            </div>

            <style>{`
        .cp-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.35);
          backdrop-filter: blur(var(--glass-blur));
          z-index: 200;
          animation: cp-fade-in 150ms ease;
        }
        [data-theme="dark"] .cp-backdrop {
          background: rgba(0, 0, 0, 0.45);
        }
        @keyframes cp-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .cp-modal {
          position: fixed;
          top: 20%;
          left: 50%;
          transform: translateX(-50%);
          width: 580px;
          max-width: calc(100vw - 32px);
          border: 1px solid var(--color-border-strong);
          border-radius: var(--radius-xl);
          box-shadow: var(--shadow-xl);
          z-index: 201;
          overflow: hidden;
          animation: cp-slide-in 280ms var(--spring-bouncy);
        }
        @keyframes cp-slide-in {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-12px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0) scale(1);
          }
        }
        .cp-input-wrap {
          display: flex;
          align-items: center;
          padding: 0 16px;
          border-bottom: 1px solid var(--color-border);
        }
        .cp-input-icon {
          color: var(--color-text-3);
          flex-shrink: 0;
        }
        .cp-input {
          flex: 1;
          height: 56px;
          border: none;
          background: transparent;
          color: var(--color-text-1);
          font-size: 17px;
          font-family: var(--font-ui);
          padding: 0 12px;
          outline: none;
        }
        .cp-input::placeholder {
          color: var(--color-text-4);
          font-style: italic;
        }
        .cp-results {
          max-height: 420px;
          overflow-y: auto;
          padding: 8px;
        }
        .cp-group-header {
          font-size: var(--text-xs);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--color-text-4);
          padding: 12px 8px 4px;
        }
        .cp-result-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 8px 10px;
          border: none;
          background: transparent;
          color: var(--color-text-2);
          font-family: var(--font-ui);
          font-size: var(--text-base);
          border-radius: var(--radius-md);
          cursor: pointer;
          text-align: left;
          transition: background var(--dur-instant);
        }
        .cp-result-item:hover,
        .cp-result-item.selected {
          background: var(--color-accent-light);
        }
        .cp-result-item.selected {
          border-left: 2px solid var(--color-accent);
        }
        .cp-result-icon {
          color: var(--color-text-3);
          flex-shrink: 0;
        }
        .cp-result-icon.action-icon {
          color: var(--color-accent);
        }
        .cp-result-text {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .cp-result-label {
          font-weight: 500;
          color: var(--color-text-1);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .cp-result-sublabel {
          font-size: var(--text-xs);
          color: var(--color-text-3);
        }
        .cp-result-shortcut {
          font-size: var(--text-xs);
          background: var(--color-surface-3);
          padding: 2px 6px;
          border-radius: var(--radius-sm);
          color: var(--color-text-3);
          flex-shrink: 0;
        }
        .cp-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 32px;
          color: var(--color-text-4);
          text-align: center;
        }
        .cp-empty p {
          font-size: var(--text-lg);
          color: var(--color-text-3);
        }
        .cp-empty span {
          font-size: var(--text-sm);
        }
      `}</style>
        </>
    );
}
