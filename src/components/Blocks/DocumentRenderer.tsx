import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { parseDocument } from '../../lib/parser';
import SelectionToolbar from '../Editor/SelectionToolbar';
import TodoBlock from './TodoBlock';
import SmartTable from './SmartTable';
import CalloutBlock from './CalloutBlock';
import QuoteBlock from './QuoteBlock';
import CodeBlock from './CodeBlock';
import TimelineBlock from './TimelineBlock';
import ProgressBlock from './ProgressBlock';
import CompareBlock from './CompareBlock';
import StatsBlock from './StatsBlock';
import AccordionBlock from './AccordionBlock';
import GalleryBlock from './GalleryBlock';
import EmbedBlock from './EmbedBlock';
import MathBlock from './MathBlock';
import KanbanBlock from './KanbanBlock';
import FlashcardBlock from './FlashcardBlock';

interface DocumentRendererProps {
    content: string;
    onChange?: (newContent: string) => void;
}

export default function DocumentRenderer({ content, onChange }: DocumentRendererProps) {
    // Parse document into AST blocks
    const blocks = useMemo(() => parseDocument(content), [content]);

    const handleBlockChange = (index: number, newRaw: string) => {
        if (!onChange) return;
        const newBlocks = [...blocks];
        newBlocks[index] = { ...newBlocks[index], raw: newRaw };
        const newDoc = newBlocks.map((b) => b.raw).join('\n');
        onChange(newDoc);
    };

    return (
        <div className="document-renderer">
            <AnimatePresence mode="popLayout">
                {blocks.map((block, i) => {
                    let element;
                    if (block.type === 'text') {
                        element = (
                            <div className="block-text">
                                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                                    {block.content}
                                </ReactMarkdown>
                            </div>
                        );
                    } else if (block.type === 'todo') {
                        element = (
                            <TodoBlock
                                block={block}
                                onChange={(newRaw: string) => handleBlockChange(i, newRaw)}
                            />
                        );
                    } else if (block.type === 'table') element = <SmartTable block={block} />;
                    else if (block.type === 'callout') element = <CalloutBlock block={block} />;
                    else if (block.type === 'quote') element = <QuoteBlock block={block} />;
                    else if (block.type === 'code') element = <CodeBlock block={block} />;
                    else if (block.type === 'timeline') element = <TimelineBlock block={block} />;
                    else if (block.type === 'progress') element = <ProgressBlock block={block} />;
                    else if (block.type === 'compare' || block.type === 'vs') element = <CompareBlock block={block} />;
                    else if (block.type === 'stats') element = <StatsBlock block={block} />;
                    else if (block.type === 'accordion') element = <AccordionBlock block={block} />;
                    else if (block.type === 'gallery') element = <GalleryBlock block={block} />;
                    else if (block.type === 'embed') element = <EmbedBlock block={block} />;
                    else if (block.type === 'math') element = <MathBlock block={block} />;
                    else if (block.type === 'kanban') element = <KanbanBlock block={block} />;
                    else if (block.type === 'flashcard' || block.type === 'flashcards' || block.type === 'cards') element = <FlashcardBlock block={block} />;
                    else {
                        element = (
                            <div className="block-unsupported">
                                <div className="block-unsupported-tag">({block.type})</div>
                                <pre>{block.content}</pre>
                            </div>
                        );
                    }

                    return (
                        <motion.div
                            key={block.id || i}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{
                                duration: 0.2,
                                delay: Math.min(i * 0.025, 0.15),
                                ease: [0.23, 1, 0.32, 1]
                            }}
                        >
                            {element}
                        </motion.div>
                    );
                })}
            </AnimatePresence>

            {onChange && (
                <SelectionToolbar
                    content={content}
                    onChange={onChange}
                />
            )}

            <style>{`
        .document-renderer {
          display: flex;
          flex-direction: column;
          gap: 20px;
          padding: 20px;
          max-width: 800px;
          margin: 0 auto;
        }
        
        .block-text {
          font-family: var(--font-ui);
          font-size: 17px;
          line-height: 1.7;
          color: var(--color-text-1);
          letter-spacing: -0.01em;
        }
        
        .block-text p {
          margin-bottom: 12px;
        }
        
        .block-text h1, .block-text h2, .block-text h3 {
          font-family: var(--font-display);
          font-weight: 600;
          margin-top: 24px;
          margin-bottom: 12px;
          letter-spacing: -0.02em;
        }
        
        .block-text h1 { font-size: 2em; }
        .block-text h2 { font-size: 1.5em; }
        .block-text h3 { font-size: 1.25em; }
        
        .block-text a {
            color: var(--color-accent);
            text-decoration: none;
        }
        .block-text a:hover {
            text-decoration: underline;
        }

        .block-text ul, .block-text ol {
            padding-left: 24px;
            margin-bottom: 16px;
        }
        .block-text li {
            margin-bottom: 4px;
        }
        
        .block-text blockquote {
            border-left: 3px solid var(--color-border);
            padding-left: 16px;
            color: var(--color-text-3);
            margin: 16px 0;
            font-style: italic;
        }

        .block-unsupported {
          background: var(--color-surface-2);
          border: 1px dashed var(--color-border);
          border-radius: var(--radius-md);
          padding: 12px;
          font-family: monospace;
          font-size: 13px;
          color: var(--color-text-3);
        }
        
        .block-unsupported-tag {
          font-weight: bold;
          color: var(--color-text-2);
          margin-bottom: 8px;
        }

        /* ─── Inline HTML formatting support ─── */
        .block-text mark {
          background: #fef08a;
          color: inherit;
          padding: 1px 3px;
          border-radius: 3px;
        }
      `}</style>
        </div>
    );
}
