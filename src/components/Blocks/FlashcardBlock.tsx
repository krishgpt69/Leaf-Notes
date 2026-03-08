import { useState } from 'react';
import type { ParsedBlock } from '../../lib/parser';
import { RefreshCw } from 'lucide-react';

interface FlashcardBlockProps {
  block: ParsedBlock;
}

export default function FlashcardBlock({ block }: FlashcardBlockProps) {
  const [flippedIdx, setFlippedIdx] = useState<Set<number>>(new Set());

  const lines = block.content.split('\n').filter(l => l.trim().length > 0);

  const cards: { id: number; front: string; back: string }[] = [];
  let currentCard: { front: string; back: string } | null = null;
  let counter = 0;

  for (const line of lines) {
    if (line.toLowerCase().startsWith('front:')) {
      if (currentCard) {
        cards.push({ id: counter++, ...currentCard });
      }
      currentCard = { front: line.substring(6).trim(), back: '' };
    } else if (line.toLowerCase().startsWith('back:') && currentCard) {
      currentCard.back = line.substring(5).trim();
    }
  }

  if (currentCard) {
    cards.push({ id: counter++, ...currentCard });
  }

  if (cards.length === 0) return null;

  const toggleFlip = (id: number) => {
    const nextFlipped = new Set(flippedIdx);
    if (nextFlipped.has(id)) nextFlipped.delete(id);
    else nextFlipped.add(id);
    setFlippedIdx(nextFlipped);
  };

  return (
    <div className="flashcard-block">
      <div className="flashcard-grid" style={{ gridTemplateColumns: `repeat(${Math.min(cards.length, 3)}, 1fr)` }}>
        {cards.map(card => {
          const isFlipped = flippedIdx.has(card.id);
          return (
            <div key={card.id} className="flashcard-scene" onClick={() => toggleFlip(card.id)}>
              <div className={`flashcard ${isFlipped ? 'flipped' : ''}`}>
                <div className="flashcard-face front">
                  <span className="flashcard-label">Front</span>
                  <div className="flashcard-content">{card.front}</div>
                  <RefreshCw size={14} className="flashcard-flip-icon" />
                </div>
                <div className="flashcard-face back">
                  <span className="flashcard-label">Back</span>
                  <div className="flashcard-content">{card.back || '...'}</div>
                  <RefreshCw size={14} className="flashcard-flip-icon" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .flashcard-block {
          margin: 16px 0;
          font-family: var(--font-ui);
        }

        .flashcard-grid {
          display: grid;
          gap: 16px;
        }

        .flashcard-scene {
          perspective: 1000px;
          cursor: pointer;
        }

        .flashcard {
          width: 100%;
          min-height: 150px;
          position: relative;
          transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
          transform-style: preserve-3d;
        }

        .flashcard.flipped {
          transform: rotateY(180deg);
        }

        .flashcard-face {
          position: absolute;
          width: 100%;
          height: 100%;
          -webkit-backface-visibility: hidden; /* Safari */
          backface-visibility: hidden;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          box-shadow: var(--shadow-sm);
        }

        .flashcard-face.back {
          transform: rotateY(180deg);
          background: var(--color-surface-2);
          border-color: var(--color-accent);
        }

        .flashcard-label {
          position: absolute;
          top: 12px;
          left: 14px;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--color-text-3);
          font-weight: 700;
        }

        .flashcard-flip-icon {
          position: absolute;
          bottom: 12px;
          right: 14px;
          color: var(--color-text-4);
          transition: color 0.2s, transform 0.5s ease;
        }

        .flashcard-scene:hover .flashcard-flip-icon {
          color: var(--color-text-2);
          transform: rotate(45deg);
        }

        .flashcard-content {
          font-size: 16px;
          color: var(--color-text-1);
          font-weight: 500;
          line-height: 1.5;
        }

        @media (max-width: 600px) {
          .flashcard-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 400px) {
          .flashcard-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
