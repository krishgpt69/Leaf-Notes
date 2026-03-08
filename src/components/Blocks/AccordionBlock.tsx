import { useState } from 'react';
import type { ParsedBlock } from '../../lib/parser';
import { ChevronDown } from 'lucide-react';

interface AccordionBlockProps {
  block: ParsedBlock;
}

export default function AccordionBlock({ block }: AccordionBlockProps) {
  const [openItems, setOpenItems] = useState<Set<number>>(new Set());

  // Parse lines: split by lines starting with '# '
  const lines = block.content.split('\n');
  const items: { id: number; title: string; content: string }[] = [];

  let currentItem: { id: number; title: string; content: string[] } | null = null;
  let counter = 0;

  for (const line of lines) {
    if (line.startsWith('# ')) {
      if (currentItem) {
        items.push({ id: currentItem.id, title: currentItem.title, content: currentItem.content.join('\n').trim() });
      }
      currentItem = { id: counter++, title: line.substring(2).trim(), content: [] };
    } else {
      if (currentItem) {
        currentItem.content.push(line);
      }
    }
  }

  if (currentItem) {
    items.push({ id: currentItem.id, title: currentItem.title, content: currentItem.content.join('\n').trim() });
  }

  const toggleItem = (id: number) => {
    const nextIds = new Set(openItems);
    if (nextIds.has(id)) nextIds.delete(id);
    else nextIds.add(id);
    setOpenItems(nextIds);
  };

  if (items.length === 0) return null;

  return (
    <div className="accordion-block">
      {items.map(item => {
        const isOpen = openItems.has(item.id);
        return (
          <div key={item.id} className={`accordion-item ${isOpen ? 'open' : ''}`}>
            <button className="accordion-header" onClick={() => toggleItem(item.id)}>
              <span className="accordion-title">{item.title}</span>
              <ChevronDown size={18} className="accordion-icon text-tertiary" />
            </button>
            <div className="accordion-content-wrapper">
              <div className="accordion-content">
                {item.content}
              </div>
            </div>
          </div>
        );
      })}

      <style>{`
        .accordion-block {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          margin: 16px 0;
          font-family: var(--font-ui);
          box-shadow: var(--shadow-sm);
          overflow: hidden;
        }

        .accordion-item {
          border-bottom: 1px solid var(--color-border);
        }
        .accordion-item:last-child {
          border-bottom: none;
        }

        .accordion-header {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: transparent;
          border: none;
          cursor: pointer;
          transition: background-color var(--dur-fast);
        }

        .accordion-header:hover {
          background-color: var(--color-surface-2);
        }

        .accordion-title {
          font-weight: 500;
          font-size: 15px;
          color: var(--color-text-1);
          text-align: left;
        }

        .accordion-icon {
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .accordion-item.open .accordion-icon {
          transform: rotate(180deg);
        }

        .accordion-content-wrapper {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .accordion-item.open .accordion-content-wrapper {
          grid-template-rows: 1fr;
        }

        .accordion-content {
          overflow: hidden;
          padding: 0 20px;
          color: var(--color-text-2);
          font-size: 15px;
          line-height: 1.6;
          opacity: 0;
          transition: padding 0.3s, opacity 0.3s;
          white-space: pre-wrap;
        }

        .accordion-item.open .accordion-content {
          padding: 0 20px 20px 20px;
          opacity: 1;
        }
      `}</style>
    </div>
  );
}
