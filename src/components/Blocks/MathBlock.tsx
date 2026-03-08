import type { ParsedBlock } from '../../lib/parser';
import { Pi } from 'lucide-react';

interface MathBlockProps {
    block: ParsedBlock;
}

export default function MathBlock({ block }: MathBlockProps) {
    const formula = block.content.trim();

    if (!formula) return null;

    // We use reliable external SVG rendering for mathematical formulas to keep the bundle size small
    const encodedFormula = encodeURIComponent(formula);
    const imgUrl = `https://latex.codecogs.com/svg.image?\\color{white}${encodedFormula}`;

    return (
        <div className="math-block">
            <div className="math-header">
                <Pi size={16} className="text-secondary opacity-50 absolute left-4" />
            </div>

            <div className="math-content">
                <img src={imgUrl} alt="Math Formula" loading="lazy" />
            </div>

            <style>{`
        .math-block {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          margin: 16px 0;
          font-family: var(--font-ui);
          box-shadow: var(--shadow-sm);
          position: relative;
          overflow: hidden;
        }

        .math-header {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 32px;
          background: linear-gradient(180deg, var(--color-surface-2) 0%, transparent 100%);
          pointer-events: none;
        }

        .math-content {
          padding: 32px 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow-x: auto;
        }

        .math-content img {
          max-width: 100%;
          height: auto;
        }
      `}</style>
        </div>
    );
}
