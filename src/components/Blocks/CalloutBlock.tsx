import type { ParsedBlock } from '../../lib/parser';
import { Info, AlertTriangle, CheckCircle, XCircle, Lightbulb } from 'lucide-react';

interface CalloutBlockProps {
  block: ParsedBlock;
}

export default function CalloutBlock({ block }: CalloutBlockProps) {
  const type = (block.args || 'info').toLowerCase();

  let icon = <Info size={20} className="text-blue" />;
  let wrapperClass = 'callout-info';

  if (type === 'warning') {
    icon = <AlertTriangle size={20} className="text-amber" />;
    wrapperClass = 'callout-warning';
  } else if (type === 'success') {
    icon = <CheckCircle size={20} className="text-green" />;
    wrapperClass = 'callout-success';
  } else if (type === 'error') {
    icon = <XCircle size={20} className="text-red" />;
    wrapperClass = 'callout-error';
  } else if (type === 'tip') {
    icon = <Lightbulb size={20} className="text-purple" />;
    wrapperClass = 'callout-tip';
  }

  return (
    <div className={`callout-block ${wrapperClass}`}>
      <div className="callout-icon">
        {icon}
      </div>
      <div className="callout-content">
        {block.content}
      </div>

      <style>{`
        .callout-block {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          padding: 16px;
          border-radius: var(--radius-lg);
          font-family: var(--font-ui);
          font-size: 15px;
          line-height: 1.5;
          margin: 8px 0;
        }

        .callout-icon {
          flex-shrink: 0;
          margin-top: 2px;
        }

        .callout-content {
          color: var(--color-text-1);
          flex: 1;
          white-space: pre-wrap;
        }

        /* Color Variants */
        .callout-info {
          background: rgba(59, 130, 246, 0.08);
          border: 1px solid rgba(59, 130, 246, 0.2);
        }
        
        .callout-warning {
          background: rgba(245, 158, 11, 0.08);
          border: 1px solid rgba(245, 158, 11, 0.2);
        }
        
        .callout-success {
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.2);
        }
        
        .callout-error {
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.2);
        }
        
        .callout-tip {
          background: rgba(168, 85, 247, 0.08);
          border: 1px solid rgba(168, 85, 247, 0.2);
        }
      `}</style>
    </div>
  );
}
