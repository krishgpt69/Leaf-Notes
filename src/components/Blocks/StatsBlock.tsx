import type { ParsedBlock } from '../../lib/parser';

interface StatsBlockProps {
  block: ParsedBlock;
}

export default function StatsBlock({ block }: StatsBlockProps) {
  const lines = block.content.split('\n').filter(l => l.trim().length > 0);

  const stats = lines.map((line, i) => {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match) {
      return { id: i, label: match[1].trim(), value: match[2].trim() };
    }
    return { id: i, label: '', value: line.trim() };
  }).filter(stat => stat.value); // only keep ones with a value

  if (stats.length === 0) return null;

  return (
    <div className="stats-block">
      <div className="stats-grid" style={{ gridTemplateColumns: `repeat(${Math.min(stats.length, 4)}, 1fr)` }}>
        {stats.map(stat => (
          <div key={stat.id} className="stat-item">
            <div className="stat-value">{stat.value}</div>
            {stat.label && <div className="stat-label">{stat.label}</div>}
          </div>
        ))}
      </div>

      <style>{`
        .stats-block {
          margin: 24px 0;
          font-family: var(--font-ui);
        }

        .stats-grid {
          display: grid;
          gap: 16px;
        }

        .stat-item {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: 24px;
          text-align: center;
          box-shadow: var(--shadow-sm);
          transition: transform var(--dur-fast), box-shadow var(--dur-fast);
        }

        .stat-item:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        .stat-value {
          font-family: var(--font-display);
          font-size: 32px;
          font-weight: 700;
          color: var(--color-accent);
          line-height: 1.2;
          margin-bottom: 8px;
          letter-spacing: -0.02em;
        }

        .stat-label {
          font-size: 13px;
          font-weight: 500;
          color: var(--color-text-2);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        @media (max-width: 600px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}
