import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Check, Type, Hash, AlignLeft } from 'lucide-react';
import { ai } from '../../lib/ai';

interface AISuggestionsProps {
  content: string;
  onApplyTitle: (title: string) => void;
  onApplySummary: (summary: string) => void;
  onApplyKeywords: (keywords: string[]) => void;
}

export default function AISuggestions({ content, onApplyTitle, onApplySummary, onApplyKeywords }: AISuggestionsProps) {
  const [suggestions, setSuggestions] = useState<{
    title?: string;
    summary?: { oneLine: string, short: string, detailed: string };
    keywords?: string[];
    readability?: { grade: number, readingEase: number };
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [activeSummaryTab, setActiveSummaryTab] = useState<'oneLine' | 'short' | 'detailed'>('oneLine');

  useEffect(() => {
    if (!content || content.length < 50) {
      setSuggestions(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const title = await ai.suggestTitle(content);
        const summary = await ai.summarizeNote(content);
        const keywords = await ai.extractKeywords(content);
        const readability = await ai.getReadability(content);

        setSuggestions({ title, summary, keywords, readability });
      } catch (err) {
        console.error('AI Suggestion failed', err);
      } finally {
        setLoading(false);
      }
    }, 2000); // Debounce AI processing

    return () => clearTimeout(timer);
  }, [content]);

  if (!suggestions && !loading) return null;

  return (
    <div className="ai-suggestions-container">
      <AnimatePresence>
        {!minimized ? (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="ai-card acrylic shadow-xl border border-white/10 overflow-hidden"
          >
            <div className="ai-card-header">
              <div className="flex items-center gap-2">
                <div className="ai-badge">
                  <Sparkles size={12} className="text-amber-400" />
                  <span>AI Assistant</span>
                </div>
                {loading && <div className="ai-loader" />}
              </div>
              <button onClick={() => setMinimized(true)} className="ai-close-btn">
                <X size={14} />
              </button>
            </div>

            <div className="ai-card-content">
              {suggestions?.title && (
                <div className="ai-section">
                  <div className="ai-section-label">
                    <Type size={12} /> Suggested Title
                  </div>
                  <div className="ai-suggestion-item">
                    <span className="ai-text">{suggestions.title}</span>
                    <div className="ai-actions">
                      <button onClick={() => onApplyTitle(suggestions.title!)} className="ai-action-btn apply">
                        <Check size={12} /> Use
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {suggestions?.summary && (
                <div className="ai-section">
                  <div className="ai-section-label flex justify-between">
                    <div className="flex items-center gap-1"><AlignLeft size={12} /> Auto Summary</div>
                    <button onClick={() => onApplySummary(suggestions.summary![activeSummaryTab])} className="ai-action-btn apply">
                      <Check size={12} /> Use
                    </button>
                  </div>
                  <div className="ai-summary-tabs">
                    <button className={`ai-tab ${activeSummaryTab === 'oneLine' ? 'active' : ''}`} onClick={() => setActiveSummaryTab('oneLine')}>1 Line</button>
                    <button className={`ai-tab ${activeSummaryTab === 'short' ? 'active' : ''}`} onClick={() => setActiveSummaryTab('short')}>Short</button>
                    <button className={`ai-tab ${activeSummaryTab === 'detailed' ? 'active' : ''}`} onClick={() => setActiveSummaryTab('detailed')}>Detailed</button>
                  </div>
                  <p className="ai-preview-text">{suggestions.summary[activeSummaryTab]}</p>
                </div>
              )}

              {suggestions?.keywords && suggestions.keywords.length > 0 && (
                <div className="ai-section">
                  <div className="ai-section-label">
                    <Hash size={12} /> Keyphrases
                  </div>
                  <div className="ai-tag-group">
                    {suggestions.keywords.map(k => (
                      <span key={k} className="ai-tag">#{k}</span>
                    ))}
                    <button onClick={() => onApplyKeywords(suggestions.keywords!)} className="ai-tag-apply">
                      <Check size={10} /> Apply All
                    </button>
                  </div>
                </div>
              )}

              {suggestions?.readability && (
                <div className="ai-footer-info">
                  <span>Readability: <b>Grade {suggestions.readability.grade}</b></span>
                  <span className="mx-2 opacity-30">|</span>
                  <span>Local & Private 🔒</span>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.button
            layoutId="ai-launch"
            onClick={() => setMinimized(false)}
            className="ai-fab-btn"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Sparkles size={18} />
          </motion.button>
        )}
      </AnimatePresence>

      <style>{`
        .ai-suggestions-container {
          position: fixed;
          bottom: 60px;
          right: 24px;
          z-index: 100;
          pointer-events: none;
        }
        .ai-card {
          width: 280px;
          border-radius: 16px;
          background: rgba(25, 25, 25, 0.85);
          backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
          pointer-events: auto;
        }
        .ai-card-header {
          padding: 10px 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .ai-badge {
          background: rgba(251, 191, 36, 0.1);
          color: #fbbf24;
          padding: 4px 8px;
          border-radius: 20px;
          font-size: 10px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 4px;
          border: 1px solid rgba(251, 191, 36, 0.2);
        }
        .ai-loader {
          width: 12px;
          height: 12px;
          border: 2px solid rgba(255,255,255,0.1);
          border-top-color: #fbbf24;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        
        .ai-card-content {
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .ai-section-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: rgba(255,255,255,0.4);
          margin-bottom: 6px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .ai-suggestion-item {
          background: rgba(255,255,255,0.03);
          padding: 8px 10px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border: 1px solid rgba(255,255,255,0.05);
        }
        .ai-text {
          font-size: 13px;
          font-weight: 500;
          color: white;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 180px;
        }
        .ai-action-btn {
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: all 0.2s;
        }
        .ai-action-btn.apply {
          background: var(--color-accent);
          color: white;
        }
        .ai-action-btn:hover {
          filter: brightness(1.1);
        }

        .ai-summary-tabs {
          display: flex;
          gap: 4px;
          margin-bottom: 8px;
        }
        .ai-tab {
          font-size: 9px;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.6);
          white-space: nowrap;
          transition: all 0.2s ease;
        }
        .ai-tab.active {
          background: var(--color-accent);
          color: white;
        }
        .ai-preview-text {
          font-size: 12px;
          line-height: 1.5;
          color: rgba(255,255,255,0.7);
          font-style: italic;
        }

        .ai-tag-group {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
        }
        .ai-tag {
          font-size: 11px;
          background: rgba(255,255,255,0.05);
          color: var(--color-accent);
          padding: 2px 6px;
          border-radius: 4px;
        }
        .ai-tag-apply {
          font-size: 10px;
          color: white;
          opacity: 0.6;
          display: flex;
          align-items: center;
          gap: 2px;
        }
        .ai-tag-apply:hover { opacity: 1; }

        .ai-footer-info {
          font-size: 10px;
          color: rgba(255,255,255,0.3);
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 4px;
        }
        
        .ai-fab-btn {
          width: 44px;
          height: 44px;
          border-radius: 22px;
          background: var(--color-accent);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
          pointer-events: auto;
          border: 1px solid rgba(255,255,255,0.1);
        }
      `}</style>
    </div>
  );
}
