import { useState, useMemo } from 'react';
import type { ParsedBlock } from '../../lib/parser';
import { CheckCircle2, Circle, AlertCircle, PlayCircle, Filter } from 'lucide-react';

interface TodoBlockProps {
  block: ParsedBlock;
  onChange: (newRaw: string) => void;
}

type TodoStatus = 'empty' | 'checked' | 'urgent' | 'progress';

interface TodoItem {
  id: string; // Unique within block
  rawLineIndex: number;
  text: string;
  status: TodoStatus;
}

export default function TodoBlock({ block, onChange }: TodoBlockProps) {
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  // Parse lines to find todos
  const { items, rawLines } = useMemo(() => {
    const lines = block.raw.split('\n');
    const parsedItems: TodoItem[] = [];

    // Regex: optional dash/asterisk, brackets with status char, text
    // E.g. "- [ ] Task" or "[!] Urgent"

    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.toLowerCase() === '(todo)') return;

      const match = trimmed.match(/^(?:[-*]\s*)?\[([\sx!>])\]\s+(.*)$/i);
      if (match) {
        const char = match[1].toLowerCase();
        let status: TodoStatus = 'empty';
        if (char === 'x') status = 'checked';
        if (char === '!') status = 'urgent';
        if (char === '>') status = 'progress';

        parsedItems.push({
          id: `todo-${i}`,
          rawLineIndex: i,
          text: match[2],
          status
        });
      } else {
        // Fallback for plain text lines
        parsedItems.push({
          id: `todo-${i}`,
          rawLineIndex: i,
          text: trimmed.replace(/^[-*]\s*/, ''),
          status: 'empty'
        });
      }
    });

    return { items: parsedItems, rawLines: lines };
  }, [block.raw]);

  const handleToggle = (item: TodoItem) => {
    // Cycle logic: empty -> checked -> empty
    // If urgent/progress, clicking it usually checks it.
    const newStatus = item.status === 'checked' ? 'empty' : 'checked';
    const charMap: Record<TodoStatus, string> = {
      empty: ' ',
      checked: 'x',
      urgent: '!',
      progress: '>'
    };

    const newChar = charMap[newStatus];
    const newLines = [...rawLines];
    const targetLine = newLines[item.rawLineIndex];

    // Replace the exact character inside the brackets
    // Find the first '[' and replace the character after it
    const bracketIndex = targetLine.indexOf('[');
    if (bracketIndex !== -1 && targetLine.length > bracketIndex + 1) {
      newLines[item.rawLineIndex] = targetLine.substring(0, bracketIndex + 1) + newChar + targetLine.substring(bracketIndex + 2);
    } else {
      newLines[item.rawLineIndex] = `[${newChar}] ${targetLine}`;
    }

    onChange(newLines.join('\n'));
  };

  const completedCount = items.filter(i => i.status === 'checked').length;
  const totalCount = items.length;
  const progressPercent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  const filteredItems = items.filter(i => {
    if (filter === 'all') return true;
    if (filter === 'completed') return i.status === 'checked';
    if (filter === 'active') return i.status !== 'checked';
    return true;
  });

  if (items.length === 0) {
    return (
      <div className="todo-block empty">
        <span className="text-secondary text-sm italic">Empty todo block</span>
      </div>
    );
  }

  return (
    <div className="todo-block">
      <div className="todo-header">
        <div className="todo-progress-container">
          <div className="todo-progress-text">
            <strong>{completedCount}/{totalCount}</strong> completed ({progressPercent}%)
          </div>
          <div className="todo-progress-bar-bg">
            <div
              className="todo-progress-bar-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="todo-filters">
          <Filter size={12} className="text-tertiary" />
          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >All</button>
          <button
            className={`filter-btn ${filter === 'active' ? 'active' : ''}`}
            onClick={() => setFilter('active')}
          >Active</button>
          <button
            className={`filter-btn ${filter === 'completed' ? 'active' : ''}`}
            onClick={() => setFilter('completed')}
          >Done</button>
        </div>
      </div>

      <div className="todo-list">
        {filteredItems.map(item => (
          <div
            key={item.id}
            className={`todo-item ${item.status}`}
            onClick={() => handleToggle(item)}
          >
            <div className="todo-checkbox">
              {item.status === 'checked' && <CheckCircle2 size={18} className="icon-checked" />}
              {item.status === 'empty' && <Circle size={18} className="icon-empty" />}
              {item.status === 'urgent' && <AlertCircle size={18} className="icon-urgent" />}
              {item.status === 'progress' && <PlayCircle size={18} className="icon-progress" />}
            </div>
            <div className="todo-text">
              {item.text}
            </div>
          </div>
        ))}
        {
          filteredItems.length === 0 && (
            <div className="todo-empty-state">No tasks match this filter.</div>
          )
        }
      </div >

      <style>{`
        .todo-block {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: 16px;
          box-shadow: var(--shadow-sm);
          font-family: var(--font-ui);
        }
        
        .todo-block.empty {
          padding: 12px 16px;
        }

        .todo-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
          flex-wrap: wrap;
          gap: 12px;
        }

        .todo-progress-container {
          flex: 1;
          min-width: 200px;
        }

        .todo-progress-text {
          font-size: 12px;
          color: var(--color-text-2);
          margin-bottom: 6px;
        }

        .todo-progress-bar-bg {
          height: 6px;
          background: var(--color-surface-2);
          border-radius: var(--radius-full);
          overflow: hidden;
        }

        .todo-progress-bar-fill {
          height: 100%;
          background: var(--color-accent);
          transition: width 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .todo-filters {
          display: flex;
          align-items: center;
          gap: 4px;
          background: var(--color-surface-2);
          padding: 4px;
          border-radius: var(--radius-md);
        }

        .filter-btn {
          background: transparent;
          border: none;
          padding: 4px 8px;
          font-size: 11px;
          font-weight: 600;
          color: var(--color-text-3);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all var(--dur-fast);
        }

        .filter-btn:hover {
          color: var(--color-text-1);
        }

        .filter-btn.active {
          background: var(--color-surface);
          color: var(--color-text-1);
          box-shadow: var(--shadow-sm);
        }

        .todo-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .todo-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 8px 10px;
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .todo-item:hover {
          background: var(--color-surface-2);
        }

        .todo-checkbox {
          flex-shrink: 0;
          margin-top: 2px;
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .todo-item:active .todo-checkbox {
          transform: scale(0.9);
        }

        .icon-empty { color: var(--color-text-4); }
        .todo-item:hover .icon-empty { color: var(--color-text-3); }
        .icon-checked { color: var(--color-accent); }
        .icon-urgent { color: var(--color-red); }
        .icon-progress { color: var(--color-blue); }

        .todo-text {
          font-size: 14px;
          color: var(--color-text-1);
          line-height: 1.5;
          transition: color 0.2s ease;
        }

        .todo-item.checked .todo-text {
          color: var(--color-text-4);
          text-decoration: line-through;
        }

        .todo-item.urgent {
          background: rgba(239, 68, 68, 0.05);
        }
        .todo-item.urgent:hover {
          background: rgba(239, 68, 68, 0.1);
        }
        .todo-item.urgent .todo-text {
          color: var(--color-red);
          font-weight: 500;
        }

        .todo-empty-state {
          padding: 12px 0;
          text-align: center;
          font-size: 13px;
          color: var(--color-text-4);
          font-style: italic;
        }
      `}</style>
    </div >
  );
}
