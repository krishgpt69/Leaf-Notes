import { useEffect, useState, useRef } from 'react';
import { useStore } from '../lib/store';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

export default function QuickCapture() {
    const [isOpen, setIsOpen] = useState(false);
    const [content, setContent] = useState('');
    const createNote = useStore((s) => s.createNote);
    const updateNote = useStore((s) => s.updateNote);
    const inputRef = useRef<HTMLInputElement>(null);
    const prefersReducedMotion = usePrefersReducedMotion();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Cmd/Ctrl + Shift + A
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
                e.preventDefault();
                setIsOpen((prev) => !prev);
            }

            // Escape to close
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            const resetId = window.setTimeout(() => {
                setContent('');
            }, 0);
            const raf = window.requestAnimationFrame(() => inputRef.current?.focus());
            return () => {
                window.cancelAnimationFrame(raf);
                window.clearTimeout(resetId);
            };
        }
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!content.trim()) return;

        // Create new note in Inbox
        const newNote = await createNote('inbox');

        // Update it with the content
        await updateNote(newNote.id, {
            content: content.trim() + '\n\n',
            title: content.trim()
        });

        setIsOpen(false);
    };

    const backdropMotion = prefersReducedMotion
        ? {
            initial: { opacity: 0 },
            animate: { opacity: 1 },
            exit: { opacity: 0 },
            transition: { duration: 0.01 }
        }
        : {
            initial: { opacity: 0 },
            animate: { opacity: 1 },
            exit: { opacity: 0 }
        };

    const modalMotion = prefersReducedMotion
        ? {
            initial: { opacity: 0 },
            animate: { opacity: 1 },
            exit: { opacity: 0 },
            transition: { duration: 0.01 }
        }
        : {
            initial: { opacity: 0, y: -20, scale: 0.98 },
            animate: { opacity: 1, y: 0, scale: 1 },
            exit: { opacity: 0, y: -20, scale: 0.98 },
            transition: { duration: 0.2, ease: 'easeOut' as const }
        };

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <>
                        <motion.div
                            className="quick-capture-backdrop"
                            initial={backdropMotion.initial}
                            animate={backdropMotion.animate}
                            exit={backdropMotion.exit}
                            transition={backdropMotion.transition}
                            onClick={() => setIsOpen(false)}
                        />
                        <motion.div
                            className="quick-capture-modal"
                            initial={modalMotion.initial}
                            animate={modalMotion.animate}
                            exit={modalMotion.exit}
                            transition={modalMotion.transition}
                        >
                            <form onSubmit={handleSubmit}>
                                <input
                                    ref={inputRef}
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    placeholder="Capture an idea instantly... (Press Enter to save)"
                                    className="quick-capture-input"
                                />
                            </form>
                            <div className="quick-capture-hint">
                                <kbd>Enter</kbd> to save &nbsp;&middot;&nbsp; <kbd>Esc</kbd> to dismiss
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
            <style>{`
        .quick-capture-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(var(--glass-blur));
          -webkit-backdrop-filter: blur(var(--glass-blur));
          z-index: 9998;
        }
        .quick-capture-modal {
          position: fixed;
          top: 20vh;
          left: 50%;
          transform: translateX(-50%);
          width: 90%;
          max-width: 600px;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-xl), 0 0 0 1px rgba(255,255,255,0.05) inset;
          padding: 16px;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .quick-capture-input {
          width: 100%;
          background: transparent;
          border: none;
          color: var(--color-text-1);
          font-size: var(--text-lg);
          font-family: var(--font-ui);
          outline: none;
          padding: 8px 0;
        }
        .quick-capture-input::placeholder {
          color: var(--color-text-4);
        }
        .quick-capture-hint {
          font-size: var(--text-xs);
          color: var(--color-text-4);
          text-align: right;
          font-family: var(--font-ui);
        }
        .quick-capture-hint kbd {
          background: var(--color-surface-2);
          border: 1px solid var(--color-border);
          padding: 2px 6px;
          border-radius: var(--radius-sm);
          font-family: var(--font-mono);
          color: var(--color-text-3);
        }
      `}</style>
        </>
    );
}
