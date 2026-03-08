import type { ParsedBlock } from '../../lib/parser';
import { Quote } from 'lucide-react';

interface QuoteBlockProps {
  block: ParsedBlock;
}

export default function QuoteBlock({ block }: QuoteBlockProps) {
  // Try to parse attribution: "- Name" or "-- Name" at the end of the content
  let text = block.content;
  let attribution = '';

  const lines = text.split('\n');
  if (lines.length > 0) {
    const lastLine = lines[lines.length - 1].trim();
    if (lastLine.startsWith('- ') || lastLine.startsWith('-- ') || lastLine.startsWith('— ') || lastLine.startsWith('—')) {
      attribution = lastLine.replace(/^[-—]+\s*/, '');
      lines.pop(); // Remove attribution line
      text = lines.join('\n');
    }
  }

  return (
    <div className="quote-block">
      <div className="quote-icon">
        <Quote size={32} className="text-tertiary opacity-40" />
      </div>

      <div className="quote-content-wrapper">
        <div className="quote-text">
          {text}
        </div>
        {attribution && (
          <div className="quote-attribution">
            — {attribution}
          </div>
        )}
      </div>

      <style>{`
        .quote-block {
          position: relative;
          padding: 24px 32px 24px 48px;
          margin: 16px 0;
          background: linear-gradient(to right, var(--color-surface-2), transparent);
          border-left: 4px solid var(--color-accent);
          border-radius: 0 var(--radius-lg) var(--radius-lg) 0;
          font-family: var(--font-display);
        }

        .quote-icon {
          position: absolute;
          top: 16px;
          left: 12px;
          color: var(--color-accent);
        }

        .quote-content-wrapper {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .quote-text {
          font-size: 1.25rem;
          line-height: 1.6;
          color: var(--color-text-1);
          font-style: italic;
          letter-spacing: -0.01em;
          white-space: pre-wrap;
        }

        .quote-attribution {
          font-family: var(--font-ui);
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--color-text-3);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
      `}</style>
    </div>
  );
}
