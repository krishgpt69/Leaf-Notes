import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    CheckSquare,
    Table,
    MessageSquare,
    Quote,
    Code,
    Clock,
    BarChart,
    Layout,
    Layers,
    Image as ImageIcon,
    ExternalLink,
    Sigma,
    Smartphone,
    type LucideIcon
} from 'lucide-react';

interface BlockOption {
    id: string;
    label: string;
    icon: LucideIcon;
    description: string;
    template: string;
}

const BLOCK_OPTIONS: BlockOption[] = [
    { id: 'todo', label: 'Todo List', icon: CheckSquare, description: 'Interactive checklist', template: '(todo)\n[ ] \n(todo)' },
    { id: 'table', label: 'Smart Table', icon: Table, description: 'Sortable, filterable table', template: '(table)\n| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |\n(table)' },
    { id: 'callout', label: 'Callout', icon: MessageSquare, description: 'Highlighted info box', template: '(callout)\nImportant information here\n(callout)' },
    { id: 'quote', label: 'Quote', icon: Quote, description: 'Beautifully styled quote', template: '(quote)\nQuote text here\n— Author\n(quote)' },
    { id: 'code', label: 'Code Block', icon: Code, description: 'Syntax highlighted code', template: '(code)\n// type code here\n(code)' },
    { id: 'timeline', label: 'Timeline', icon: Clock, description: 'Visual event sequence', template: '(timeline)\n10:00: Event A\n12:00: Event B\n(timeline)' },
    { id: 'kanban', label: 'Kanban', icon: Layout, description: 'Board for project management', template: '(kanban)\n# Todo\n- Task 1\n# In Progress\n- Task 2\n# Done\n- Task 3\n(kanban)' },
    { id: 'vstable', label: 'Compare Table', icon: Layers, description: 'Side-by-side comparison', template: '(vs)\n| Feature | Option A | Option B |\n| --- | --- | --- |\n| Price | $10 | $20 |\n(vs)' },
    { id: 'stats', label: 'Stats Grid', icon: BarChart, description: 'Large number displays', template: '(stats)\nRevenue: $1.2M\nGrowth: +15%\n(stats)' },
    { id: 'flashcards', label: 'Flashcards', icon: Smartphone, description: 'Interactive learning cards', template: '(flashcards)\nQ: Question?\nA: Answer!\n(flashcards)' },
    { id: 'image', label: 'Gallery', icon: ImageIcon, description: 'Image grid', template: '(gallery)\nhttps://path/to/image1.jpg\nhttps://path/to/image2.jpg\n(gallery)' },
    { id: 'embed', label: 'Embed', icon: ExternalLink, description: 'YouTube or Web embed', template: '(embed)\nhttps://youtube.com/watch?v=...\n(embed)' },
    { id: 'math', label: 'Math', icon: Sigma, description: 'LaTeX-style formulas', template: '(math)\nE = mc^2\n(math)' },
];

interface BlockPickerProps {
    onSelect: (template: string) => void;
    onClose: () => void;
    anchor: { top: number; left: number };
}

export default function BlockPicker({ onSelect, onClose, anchor }: BlockPickerProps) {
    const [search, setSearch] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const menuRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const filtered = BLOCK_OPTIONS.filter(o =>
        o.label.toLowerCase().includes(search.toLowerCase()) ||
        o.id.toLowerCase().includes(search.toLowerCase())
    );

    useEffect(() => {
        const resetId = window.setTimeout(() => {
            setSelectedIndex(0);
        }, 0);
        return () => window.clearTimeout(resetId);
    }, [search]);

    useEffect(() => {
        // Scroll selected item into view
        if (itemRefs.current[selectedIndex]) {
            itemRefs.current[selectedIndex]?.scrollIntoView({
                block: 'nearest',
            });
        }
    }, [selectedIndex]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (prev + 1) % filtered.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => (prev - 1 + filtered.length) % filtered.length);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (filtered[selectedIndex]) onSelect(filtered[selectedIndex].template);
            } else if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [filtered, selectedIndex, onSelect, onClose]);

    // Handle click outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    const HEIGHT = 400; // max height
    const preferTop = anchor.top + HEIGHT + 20 > window.innerHeight;
    const finalTop = preferTop ? Math.max(10, anchor.top - HEIGHT - 10) : anchor.top + 20;

    return createPortal(
        <div
            ref={menuRef}
            className="block-picker-menu acrylic animate-in zoom-in-95 duration-200"
            style={{
                position: 'fixed',
                top: finalTop,
                left: anchor.left,
                zIndex: 10000, // Make sure it's above other elements
                width: '300px',
                maxHeight: `${HEIGHT}px`,
                overflowY: 'auto',
                borderRadius: '12px',
                border: '1px solid var(--color-border)',
                boxShadow: 'var(--shadow-lg)',
                padding: '8px'
            }}
        >
            <div className="picker-search">
                <input
                    autoFocus
                    type="text"
                    placeholder="Search blocks (todo, table, charts...)"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="search-input"
                />
            </div>

            <div className="picker-options">
                {filtered.map((opt, i) => (
                    <button
                        key={opt.id}
                        ref={el => { itemRefs.current[i] = el; }}
                        className={`picker-option ${i === selectedIndex ? 'selected' : ''}`}
                        onClick={() => onSelect(opt.template)}
                        onMouseEnter={() => setSelectedIndex(i)}
                    >
                        <div className={`option-icon ${i === selectedIndex ? 'active' : ''}`}>
                            <opt.icon size={16} />
                        </div>
                        <div className="option-info">
                            <span className="option-label">{opt.label}</span>
                            <span className="option-desc">{opt.description}</span>
                        </div>
                    </button>
                ))}
                {filtered.length === 0 && (
                    <div className="picker-no-results">No blocks found</div>
                )}
            </div>

            <style>{`
        .block-picker-menu {
          background: var(--color-surface);
          backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
        }
        .picker-search {
          padding-bottom: 8px;
          border-bottom: 1px solid var(--color-border);
          margin-bottom: 8px;
        }
        .search-input {
          width: 100%;
          background: transparent;
          border: none;
          color: var(--color-text-1);
          font-size: 13px;
          padding: 8px;
          outline: none;
        }
        .picker-option {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 10px;
          border-radius: 8px;
          border: none;
          background: transparent;
          cursor: pointer;
          text-align: left;
          transition: all 0.15s ease;
        }
        .picker-option.selected {
          background: var(--color-surface-2);
        }
        .option-icon {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: var(--color-surface-3);
          color: var(--color-text-2);
          transition: all 0.2s ease;
        }
        .option-icon.active {
          background: var(--color-accent-light);
          color: var(--color-accent);
        }
        .option-info {
          display: flex;
          flex-direction: column;
        }
        .option-label {
          font-size: 14px;
          font-weight: 600;
          color: var(--color-text-1);
        }
        .option-desc {
          font-size: 11px;
          color: var(--color-text-3);
        }
        .picker-no-results {
          padding: 20px;
          text-align: center;
          color: var(--color-text-3);
          font-size: 13px;
        }
      `}</style>
        </div>,
        document.body
    );
}
