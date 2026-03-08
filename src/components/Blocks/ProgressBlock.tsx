import type { ParsedBlock } from '../../lib/parser';
import { Activity } from 'lucide-react';

interface ProgressBlockProps {
  block: ParsedBlock;
}

export default function ProgressBlock({ block }: ProgressBlockProps) {
  const lines = block.content.split('\n').filter(l => l.trim().length > 0);

  const bars = lines.map((line, i) => {
    // E.g. "Development: 65%" or "Testing: 20"
    const match = line.match(/^([^:]+):\s*([0-9]+)%?$/);
    if (match) {
      const label = match[1].trim();
      const percent = Math.min(100, Math.max(0, parseInt(match[2], 10) || 0));
      return { id: i, label, percent };
    }
    return { id: i, label: line.trim(), percent: 0 };
  });

  if (bars.length === 0) return null;

  return (
    <div className="progress-block">
      <div className="progress-header">
        <Activity size={16} className="text-secondary" />
        <span className="font-semibold text-secondary text-sm tracking-wide uppercase">Progress Tracker</span>
      </div>

      <div className="progress-container">
        {bars.map(bar => (
          <div key={bar.id} className="progress-item">
            <div className="progress-labels">
              <span className="progress-label">{bar.label}</span>
              <span className="progress-value">{bar.percent}%</span>
            </div>

            <div className="progress-bar-bg">
              <div
                className="progress-bar-fill"
                style={{ width: `${bar.percent}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .progress-block {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: 20px;
          margin: 16px 0;
          font-family: var(--font-ui);
          box-shadow: var(--shadow-sm);
        }

        .progress-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 20px;
          border-bottom: 1px solid var(--color-border);
          padding-bottom: 12px;
        }

        .progress-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .progress-item {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .progress-labels {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 14px;
        }

        .progress-label {
          color: var(--color-text-1);
          font-weight: 500;
        }

        .progress-value {
          color: var(--color-text-3);
          font-variant-numeric: tabular-nums;
        }

        .progress-bar-bg {
          height: 8px;
          background: var(--color-surface-2);
          border-radius: var(--radius-full);
          overflow: hidden;
        }

        .progress-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--color-accent) 0%, var(--color-accent-light) 100%);
          border-radius: var(--radius-full);
          transition: width 1s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  );
}
