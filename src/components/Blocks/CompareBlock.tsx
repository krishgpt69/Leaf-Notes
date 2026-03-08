import type { ParsedBlock } from '../../lib/parser';
import { Columns, CheckCircle2, XCircle } from 'lucide-react';

interface CompareBlockProps {
  block: ParsedBlock;
}

export default function CompareBlock({ block }: CompareBlockProps) {
  const lines = block.content.split('\n').filter(l => l.trim().length > 0);

  if (lines.length < 2) return null;

  // First line is headers separated by '|' or 'vs'
  const separator = lines[0].includes('|') ? '|' : (lines[0].toLowerCase().includes(' vs ') ? / vs /i : ',');

  const headers = lines[0].split(separator).map(s => s.trim());
  if (headers.length !== 2) return null; // Only 2 columns supported for visual compare

  const rows = lines.slice(1).map(line => {
    const cells = line.split(separator).map(s => s.trim());
    return { left: cells[0] || '', right: cells[1] || '' };
  });

  return (
    <div className="compare-block">
      <div className="compare-header-row">
        <div className="compare-header left">
          <Columns size={16} className="text-secondary opacity-50 absolute left-4" />
          <span className="compare-title">{headers[0]}</span>
        </div>
        <div className="compare-vs-badge">VS</div>
        <div className="compare-header right">
          <span className="compare-title">{headers[1]}</span>
        </div>
      </div>

      <div className="compare-body">
        {rows.map((row, i) => (
          <div key={i} className="compare-row">
            <div className="compare-cell left">
              {row.left.toLowerCase() === 'yes' || row.left.toLowerCase() === 'true' || row.left.toLowerCase().includes('good') || row.left.startsWith('+') ? (
                <CheckCircle2 size={16} className="text-green flex-shrink-0" />
              ) : row.left.toLowerCase() === 'no' || row.left.toLowerCase() === 'false' || row.left.toLowerCase().includes('bad') || row.left.startsWith('-') ? (
                <XCircle size={16} className="text-red flex-shrink-0" />
              ) : null}
              <span>{row.left.replace(/^[-+]\s*/, '')}</span>
            </div>

            <div className="compare-divider" />

            <div className="compare-cell right">
              {row.right.toLowerCase() === 'yes' || row.right.toLowerCase() === 'true' || row.right.toLowerCase().includes('good') || row.right.startsWith('+') ? (
                <CheckCircle2 size={16} className="text-green flex-shrink-0" />
              ) : row.right.toLowerCase() === 'no' || row.right.toLowerCase() === 'false' || row.right.toLowerCase().includes('bad') || row.right.startsWith('-') ? (
                <XCircle size={16} className="text-red flex-shrink-0" />
              ) : null}
              <span>{row.right.replace(/^[-+]\s*/, '')}</span>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .compare-block {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          margin: 16px 0;
          font-family: var(--font-ui);
          box-shadow: var(--shadow-sm);
          overflow: hidden;
        }

        .compare-header-row {
          display: flex;
          position: relative;
          background: var(--color-surface-2);
          border-bottom: 1px solid var(--color-border);
        }

        .compare-header {
          flex: 1;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        .compare-title {
          font-family: var(--font-display);
          font-size: 16px;
          font-weight: 600;
          color: var(--color-text-1);
          letter-spacing: -0.01em;
        }

        .compare-vs-badge {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          background: var(--color-accent);
          color: white;
          font-size: 11px;
          font-weight: 800;
          padding: 4px 8px;
          border-radius: 12px;
          letter-spacing: 0.1em;
          box-shadow: var(--shadow-sm);
          z-index: 10;
        }

        .compare-body {
          display: flex;
          flex-direction: column;
        }

        .compare-row {
          display: flex;
          border-bottom: 1px solid var(--color-border);
          transition: background-color var(--dur-fast);
        }

        .compare-row:last-child {
          border-bottom: none;
        }

        .compare-row:hover {
          background-color: var(--color-surface-2);
        }

        .compare-cell {
          flex: 1;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 15px;
          color: var(--color-text-2);
          line-height: 1.5;
        }

        .compare-cell.left {
          justify-content: flex-end;
          text-align: right;
        }

        .compare-cell.right {
          justify-content: flex-start;
          text-align: left;
        }

        .compare-divider {
          width: 1px;
          background: var(--color-border);
          opacity: 0.5;
        }
      `}</style>
    </div>
  );
}
