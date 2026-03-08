import type { ParsedBlock } from '../../lib/parser';
import { Image as ImageIcon } from 'lucide-react';

interface GalleryBlockProps {
  block: ParsedBlock;
}

export default function GalleryBlock({ block }: GalleryBlockProps) {
  const lines = block.content.split('\n').filter(l => l.trim().length > 0);

  const images = lines.map((line, i) => {
    const parts = line.split('|').map(s => s.trim());
    return {
      id: i,
      url: parts[0] || line.trim(),
      caption: parts[1] || ''
    };
  }).filter(img => img.url);

  if (images.length === 0) return null;

  // Determine grid columns based on number of images
  const columns = Math.min(images.length, 3);

  return (
    <div className="gallery-block">
      <div className="gallery-header">
        <ImageIcon size={16} className="text-secondary" />
        <span className="font-semibold text-secondary text-sm tracking-wide uppercase">Gallery</span>
      </div>

      <div className="gallery-grid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {images.map(img => (
          <div key={img.id} className="gallery-item">
            <div className="gallery-img-wrapper">
              <img src={img.url} alt={img.caption || 'Gallery image'} loading="lazy" />
            </div>
            {img.caption && <div className="gallery-caption">{img.caption}</div>}
          </div>
        ))}
      </div>

      <style>{`
        .gallery-block {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: 20px;
          margin: 16px 0;
          font-family: var(--font-ui);
          box-shadow: var(--shadow-sm);
        }

        .gallery-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
        }

        .gallery-grid {
          display: grid;
          gap: 16px;
        }

        .gallery-item {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .gallery-img-wrapper {
          position: relative;
          width: 100%;
          padding-top: 75%; /* 4:3 Aspect Ratio */
          border-radius: var(--radius-md);
          overflow: hidden;
          background: var(--color-surface-2);
          border: 1px solid var(--color-border);
        }

        .gallery-img-wrapper img {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.5s ease;
        }

        .gallery-img-wrapper:hover img {
          transform: scale(1.05);
        }

        .gallery-caption {
          font-size: 13px;
          color: var(--color-text-2);
          text-align: center;
          font-style: italic;
        }

        @media (max-width: 600px) {
          .gallery-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div >
  );
}
