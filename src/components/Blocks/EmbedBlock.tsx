import type { ParsedBlock } from '../../lib/parser';
import { Youtube, MonitorPlay, Link as LinkIcon } from 'lucide-react';

interface EmbedBlockProps {
  block: ParsedBlock;
}

export default function EmbedBlock({ block }: EmbedBlockProps) {
  const url = block.content.trim();

  if (!url) return null;

  // Extremely basic heuristic for Youtube vs others
  const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
  const isVimeo = url.includes('vimeo.com');
  const isTwitter = url.includes('twitter.com') || url.includes('x.com');

  let embedUrl = url;

  if (isYoutube) {
    // Extract ID (naive approach for MVP)
    const match = url.match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i);
    if (match && match[1]) {
      embedUrl = `https://www.youtube.com/embed/${match[1]}`;
    }
  }

  return (
    <div className="embed-block">
      <div className="embed-header">
        {isYoutube ? <Youtube size={16} className="text-red" /> :
          isVimeo ? <MonitorPlay size={16} className="text-blue" /> :
            <LinkIcon size={16} className="text-secondary" />}
        <span className="font-semibold text-secondary text-sm tracking-wide uppercase">
          {isYoutube ? 'YouTube Embed' : isVimeo ? 'Vimeo Embed' : isTwitter ? 'Tweet Embed' : 'External Embed'}
        </span>
      </div>

      <div className="embed-container">
        {(isYoutube || isVimeo) ? (
          <iframe
            src={embedUrl}
            title="Embedded content"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <a href={url} target="_blank" rel="noopener noreferrer" className="embed-fallback-link">
            <LinkIcon size={24} className="text-accent mb-2" />
            <span>Open Embedded Link</span>
            <span className="embed-url-text">{url}</span>
          </a>
        )}
      </div>

      <style>{`
        .embed-block {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: 16px;
          margin: 16px 0;
          font-family: var(--font-ui);
          box-shadow: var(--shadow-sm);
        }

        .embed-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
        }

        .embed-container {
          position: relative;
          width: 100%;
          padding-top: 56.25%; /* 16:9 Aspect Ratio */
          border-radius: var(--radius-md);
          overflow: hidden;
          background: var(--color-surface-2);
          border: 1px solid var(--color-border);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .embed-container iframe {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }

        .embed-fallback-link {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          color: var(--color-text-1);
          font-weight: 500;
          transition: background 0.2s;
        }

        .embed-fallback-link:hover {
          background: var(--color-surface-2);
        }

        .embed-url-text {
          font-size: 12px;
          color: var(--color-text-3);
          margin-top: 8px;
          font-weight: 400;
          max-width: 80%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
