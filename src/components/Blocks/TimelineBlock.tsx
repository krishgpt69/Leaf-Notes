import type { ParsedBlock } from '../../lib/parser';
import { Calendar, Circle, CheckCircle2 } from 'lucide-react';

interface TimelineBlockProps {
  block: ParsedBlock;
}

export default function TimelineBlock({ block }: TimelineBlockProps) {
  const lines = block.content.split('\n').filter(l => l.trim().length > 0);

  const events = lines.map((line, i) => {
    let isPast = false;
    let cleanLine = line.trim();

    // Remove leading list markers
    if (/^[-*]\s*/.test(cleanLine)) cleanLine = cleanLine.replace(/^[-*]\s*/, '');

    // Check for checkboxes
    const checkboxMatch = cleanLine.match(/^\[([ xX])\]\s*/);
    if (checkboxMatch) {
      if (checkboxMatch[1].toLowerCase() === 'x') isPast = true;
      cleanLine = cleanLine.replace(/^\[([ xX])\]\s*/, '');
    }

    // Split by colon if it exists
    const colonMatch = cleanLine.match(/^([^:]+):\s*(.*)$/);
    if (colonMatch) {
      return { id: i, time: colonMatch[1].trim(), desc: colonMatch[2].trim(), isPast };
    }

    return { id: i, time: '', desc: cleanLine, isPast };
  });

  if (events.length === 0) return null;

  return (
    <div className="timeline-block">
      <div className="timeline-header">
        <Calendar size={16} className="text-secondary" />
        <span className="font-semibold text-secondary text-sm tracking-wide uppercase">Timeline</span>
      </div>

      <div className="timeline-container">
        {events.map((evt, idx) => (
          <div key={evt.id} className={`timeline-event ${evt.isPast ? 'past' : ''} ${idx === events.length - 1 ? 'last' : ''}`}>
            <div className="timeline-mark">
              {evt.isPast ? (
                <CheckCircle2 size={18} className="text-accent timeline-icon bg-surface" />
              ) : (
                <Circle size={18} className="text-tertiary timeline-icon bg-surface" />
              )}
              {idx !== events.length - 1 && <div className="timeline-line"></div>}
            </div>

            <div className="timeline-content">
              {evt.time && <div className="timeline-time">{evt.time}</div>}
              <div className="timeline-desc">{evt.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .timeline-block {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: 20px;
          margin: 16px 0;
          font-family: var(--font-ui);
          box-shadow: var(--shadow-sm);
        }

        .timeline-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 20px;
          border-bottom: 1px solid var(--color-border);
          padding-bottom: 12px;
        }

        .timeline-container {
          display: flex;
          flex-direction: column;
        }

        .timeline-event {
          display: flex;
          gap: 16px;
        }

        .timeline-mark {
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
          width: 24px;
        }

        .timeline-icon {
          z-index: 2;
          background: var(--color-surface);
          border-radius: 50%;
        }

        .timeline-line {
          position: absolute;
          top: 18px;
          bottom: -4px;
          width: 2px;
          background: var(--color-border);
          z-index: 1;
        }

        .timeline-event.past .timeline-line {
          background: var(--color-accent);
          opacity: 0.5;
        }

        .timeline-content {
          padding-bottom: 24px;
          flex: 1;
        }

        .timeline-event.last .timeline-content {
          padding-bottom: 0;
        }

        .timeline-time {
          font-size: 13px;
          font-weight: 600;
          color: var(--color-text-2);
          margin-bottom: 4px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .timeline-desc {
          font-size: 15px;
          color: var(--color-text-1);
          line-height: 1.5;
        }

        .timeline-event.past .timeline-desc {
          color: var(--color-text-3);
        }
      `}</style>
    </div >
  );
}
