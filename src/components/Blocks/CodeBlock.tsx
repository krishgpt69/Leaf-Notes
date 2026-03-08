import { useState } from 'react';
import type { ParsedBlock } from '../../lib/parser';
import { Copy, Check, Terminal } from 'lucide-react';

interface CodeBlockProps {
  block: ParsedBlock;
}

export default function CodeBlock({ block }: CodeBlockProps) {
  const language = (block.args || 'code').toLowerCase();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(block.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <div className="code-block-mac-dots">
          <div className="mac-dot red"></div>
          <div className="mac-dot yellow"></div>
          <div className="mac-dot green"></div>
        </div>

        <div className="code-block-language">
          <Terminal size={12} className="text-tertiary" />
          {language}
        </div>

        <button
          className={`code-block-copy ${copied ? 'copied' : ''}`}
          onClick={handleCopy}
          title="Copy code"
        >
          {copied ? <Check size={14} className="text-green" /> : <Copy size={14} className="text-tertiary" />}
          <span className="copy-label">{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>

      <div className="code-block-content">
        <pre>
          <code className={`language-${language}`}>
            {block.content}
          </code>
        </pre>
      </div>

      <style>{`
        .code-block-wrapper {
          background: #1e1e1e; /* Dark theme default for code */
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          overflow: hidden;
          font-family: var(--font-mono);
          margin: 16px 0;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
        }

        .code-block-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 16px;
          background: #2d2d2d;
          border-bottom: 1px solid #111;
        }

        .code-block-mac-dots {
          display: flex;
          gap: 6px;
          align-items: center;
          width: 60px; /* fixed width to balance header */
        }

        .mac-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        .mac-dot.red { background: #ff5f56; }
        .mac-dot.yellow { background: #ffbd2e; }
        .mac-dot.green { background: #27c93f; }

        .code-block-language {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #a0a0a0;
          font-size: 12px;
          font-family: var(--font-ui);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 600;
        }

        .code-block-copy {
          display: flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          border: none;
          color: #a0a0a0;
          font-size: 11px;
          font-family: var(--font-ui);
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
          transition: background 0.2s, color 0.2s;
          width: 60px; /* fixed width to balance header */
          justify-content: flex-end;
        }

        .code-block-copy:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .code-block-copy.copied {
          color: #27c93f;
        }

        .code-block-content {
          padding: 16px;
          overflow-x: auto;
        }

        .code-block-content pre {
          margin: 0;
        }

        .code-block-content code {
          font-family: var(--font-mono);
          font-size: 13px;
          line-height: 1.6;
          color: #e4e4e4;
          white-space: pre;
          tab-size: 2;
        }
      `}</style>
    </div >
  );
}
