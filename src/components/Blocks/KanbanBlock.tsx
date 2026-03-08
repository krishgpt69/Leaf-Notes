import type { ParsedBlock } from '../../lib/parser';
import { Columns } from 'lucide-react';

interface KanbanBlockProps {
  block: ParsedBlock;
}

interface KanbanColumn {
  title: string;
  items: string[];
}

export default function KanbanBlock({ block }: KanbanBlockProps) {
  const lines = block.content.split('\n');

  const columns: KanbanColumn[] = [];
  let currentCol: KanbanColumn | undefined;

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Heuristic: if it has no list marker and is short, it's a new column header
    const isListMarker = /^[-*]\s/.test(trimmed);
    const isHeader = trimmed.startsWith('#') || (!isListMarker && trimmed.length < 40 && !trimmed.includes('.'));

    if (isHeader) {
      if (currentCol) columns.push(currentCol);
      const title = trimmed.replace(/^#*\s*/, '');
      currentCol = { title: title || 'Column', items: [] };
    } else if (currentCol) {
      const itemText = trimmed.replace(/^[-*]\s*/, '');
      currentCol.items.push(itemText);
    } else {
      // First item but no column header? Create a default one.
      currentCol = { title: 'Backlog', items: [trimmed.replace(/^[-*]\s*/, '')] };
    }
  });

  if (currentCol?.items.length) columns.push(currentCol);

  if (columns.length === 0) return null;

  return (
    <div className="kanban-block">
      <div className="kanban-header">
        <Columns size={16} className="text-secondary" />
        <span className="font-semibold text-secondary text-sm tracking-wide uppercase">Kanban Board</span>
      </div>

      <div className="kanban-board">
        {columns.map((col, i) => (
          <div key={i} className="kanban-column">
            <div className="kanban-col-header">
              {col.title}
              <span className="kanban-col-count">{col.items.length}</span>
            </div>
            <div className="kanban-items">
              {col.items.map((item, j) => (
                <div key={j} className="kanban-card">
                  {item}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .kanban-block {
          background: var(--color-surface);
          border: 1px dashed var(--color-border);
          border-radius: var(--radius-lg);
          padding: 20px;
          margin: 16px 0;
          font-family: var(--font-ui);
        }

        .kanban-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 20px;
        }

        .kanban-board {
          display: flex;
          gap: 16px;
          overflow-x: auto;
          padding-bottom: 8px;
        }

        .kanban-column {
          flex: 1;
          min-width: 250px;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          display: flex;
          flex-direction: column;
          max-height: 400px;
        }

        .kanban-col-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          font-weight: 600;
          font-size: 14px;
          color: var(--color-text-1);
          border-bottom: 1px solid var(--color-border);
          background: rgba(255, 255, 255, 0.02);
        }

        .kanban-col-count {
          background: var(--color-surface-2);
          color: var(--color-text-2);
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 10px;
        }

        .kanban-items {
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          overflow-y: auto;
        }

        .kanban-card {
          background: var(--color-surface-2);
          border: 1px solid var(--color-border);
          padding: 12px;
          border-radius: var(--radius-sm);
          font-size: 14px;
          color: var(--color-text-2);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
          transition: transform 0.2s, box-shadow 0.2s;
          cursor: grab;
        }

        .kanban-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
          border-color: var(--color-accent);
          color: var(--color-text-1);
        }
      `}</style>
    </div>
  );
}
