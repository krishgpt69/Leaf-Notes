import { useState, useRef, useCallback } from 'react';
import { useStore } from '../lib/store';
import { db, type Note, INBOX_FOLDER_ID } from '../lib/db';
import { v4 as uuid } from 'uuid';
import { countWords, extractTitle, extractTags } from '../lib/utils';
import {
  Upload,
  FileText,
  FileJson,
  FileType,
  CheckCircle,
  AlertTriangle,
  X,
} from 'lucide-react';

interface ImportResult {
  name: string;
  status: 'success' | 'error';
  message?: string;
}

export default function ImportPanel() {
  const refreshNotes = useStore((s) => s.refreshNotes);
  const setActiveSection = useStore((s) => s.setActiveSection);

  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File): Promise<ImportResult> => {
      try {
        const text = await file.text();
        const name = file.name.replace(/\.(md|txt|json|html)$/i, '');

        if (file.name.endsWith('.json')) {
          // Try parsing as an array of notes or a single note object
          const parsed = JSON.parse(text);
          const notesArray = Array.isArray(parsed) ? parsed : [parsed];
          let imported = 0;

          for (const item of notesArray) {
            const content = item.content || item.body || item.text || JSON.stringify(item, null, 2);
            const title = item.title || item.name || extractTitle(content);
            const note: Note = {
              id: uuid(),
              title,
              content,
              folderId: INBOX_FOLDER_ID,
              tags: extractTags(content),
              starred: false,
              pinned: false,
              trashed: false,
              createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString(),
              updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : (item.modifiedAt ? new Date(item.modifiedAt).toISOString() : new Date().toISOString()),
              wordCount: countWords(content),
            };
            await db.notes.put(note);
            imported++;
          }
          return {
            name: file.name,
            status: 'success',
            message: `Imported ${imported} note${imported !== 1 ? 's' : ''}`,
          };
        }

        // Markdown or plain text
        const title = extractTitle(text) || name;
        const note: Note = {
          id: uuid(),
          title,
          content: text,
          folderId: INBOX_FOLDER_ID,
          tags: extractTags(text),
          starred: false,
          pinned: false,
          trashed: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          wordCount: countWords(text),
        };
        await db.notes.put(note);

        return { name: file.name, status: 'success' };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to import';
        return {
          name: file.name,
          status: 'error',
          message,
        };
      }
    },
    []
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setImporting(true);
      setResults([]);

      const importResults: ImportResult[] = [];
      for (const file of Array.from(files)) {
        const result = await processFile(file);
        importResults.push(result);
        setResults([...importResults]);
      }

      await refreshNotes();
      setImporting(false);
    },
    [processFile, refreshNotes]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  return (
    <div className="import-panel animate-in">
      <div className="intel-premium-header" style={{ padding: '32px 32px 0', position: 'relative' }}>
        <div>
          <h1 className="intel-premium-title" style={{ fontSize: '48px' }}>Import</h1>
          <p className="intel-premium-subtitle">Bring your external thoughts into Leaf.</p>
        </div>
        <button
          className="import-close"
          onClick={() => setActiveSection('notes')}
        >
          <X size={20} />
        </button>
      </div>

      <div className="import-body">
        {/* Drop zone */}
        <div
          className={`import-dropzone ${dragOver ? 'drag-over' : ''}`}
          style={{ animation: 'intelFadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) backwards', animationDelay: '0.1s' }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.txt,.json,.html"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          <Upload size={36} strokeWidth={1.5} />
          <h3>Drop files here or click to browse</h3>
          <p>Supports Markdown (.md), text (.txt), and JSON (.json)</p>
        </div>

        {/* Supported formats */}
        <div className="import-formats" style={{ animation: 'intelFadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) backwards', animationDelay: '0.2s' }}>
          <h4>Supported Formats</h4>
          <div className="import-format-grid">
            <div className="import-format-card">
              <FileText size={20} />
              <span className="format-name">Markdown</span>
              <span className="format-ext">.md</span>
            </div>
            <div className="import-format-card">
              <FileType size={20} />
              <span className="format-name">Plain Text</span>
              <span className="format-ext">.txt</span>
            </div>
            <div className="import-format-card">
              <FileJson size={20} />
              <span className="format-name">JSON</span>
              <span className="format-ext">.json</span>
            </div>
          </div>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="import-results" style={{ animation: 'intelFadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) backwards', animationDelay: '0.1s' }}>
            <h4>
              Import Results
              {!importing && (
                <span className="results-summary">
                  {results.filter((r) => r.status === 'success').length} of{' '}
                  {results.length} succeeded
                </span>
              )}
            </h4>
            <div className="import-results-list">
              {results.map((result, i) => (
                <div
                  key={i}
                  className={`import-result-item ${result.status}`}
                >
                  {result.status === 'success' ? (
                    <CheckCircle size={16} />
                  ) : (
                    <AlertTriangle size={16} />
                  )}
                  <span className="result-name">{result.name}</span>
                  {result.message && (
                    <span className="result-message">{result.message}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .import-panel {
          flex: 1;
          height: 100%;
          display: flex;
          flex-direction: column;
          border-radius: var(--radius-lg);
          min-width: 0;
          overflow: hidden;
        }
        .import-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 0 24px;
        }
        .import-close {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: transparent;
          color: var(--color-text-3);
          border-radius: var(--radius-sm);
          cursor: pointer;
          position: absolute;
          top: 32px;
          right: 32px;
        }
        .import-close:hover {
          background: var(--color-surface-2);
          color: var(--color-text-1);
        }
        .import-body {
          flex: 1;
          overflow-y: auto;
          padding: 16px 32px 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .import-body > * {
          width: 100%;
          max-width: 520px;
        }

        /* Drop zone */
        .import-dropzone {
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          padding: 48px 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          text-align: center;
          cursor: pointer;
          color: var(--color-text-3);
          background: var(--color-surface-2);
          backdrop-filter: blur(var(--glass-blur));
          -webkit-backdrop-filter: blur(var(--glass-blur));
          transition: border-color var(--dur-fast) var(--spring-snappy),
            background-color var(--dur-fast) var(--spring-snappy),
            color var(--dur-fast) var(--spring-snappy),
            transform 0.4s cubic-bezier(0.16, 1, 0.3, 1),
            box-shadow 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .import-dropzone:hover {
          border-color: var(--color-accent);
          background: var(--color-accent-light);
          color: var(--color-accent);
          transform: translateY(-3px);
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.05);
        }
        .import-dropzone.drag-over {
          border-color: var(--color-accent);
          background: var(--color-accent-light);
          color: var(--color-accent);
          transform: scale(1.02) translateY(-3px);
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.08);
        }
        .import-dropzone h3 {
          font-size: var(--text-md);
          font-weight: 500;
          color: var(--color-text-2);
        }
        .import-dropzone p {
          font-size: var(--text-sm);
        }

        /* Formats */
        .import-formats {
          margin-top: 32px;
        }
        .import-formats h4 {
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--color-text-2);
          margin-bottom: 12px;
        }
        .import-format-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .import-format-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 16px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          background: var(--color-surface-2);
          color: var(--color-text-3);
          backdrop-filter: blur(var(--glass-blur));
          -webkit-backdrop-filter: blur(var(--glass-blur));
          transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .import-format-card:hover {
          transform: translateY(-2px);
          border-color: var(--color-accent);
          color: var(--color-accent);
        }
        .format-name {
          font-size: var(--text-sm);
          font-weight: 500;
          color: var(--color-text-2);
        }
        .format-ext {
          font-size: var(--text-xs);
          color: var(--color-text-4);
          font-family: var(--font-mono);
        }

        /* Results */
        .import-results {
          margin-top: 24px;
          border-top: 1px solid var(--color-border);
          padding-top: 16px;
        }
        .import-results h4 {
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--color-text-2);
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .results-summary {
          font-weight: 400;
          color: var(--color-text-3);
          font-size: var(--text-xs);
        }
        .import-results-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .import-result-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
          color: var(--color-text-2);
        }
        .import-result-item.success {
          color: var(--color-teal);
          background: var(--color-teal-light);
        }
        .import-result-item.error {
          color: var(--color-red);
          background: var(--color-red-light);
        }
        .result-name {
          font-weight: 500;
          flex: 1;
        }
        .result-message {
          font-size: var(--text-xs);
          opacity: 0.8;
        }
      `}</style>
    </div>
  );
}
