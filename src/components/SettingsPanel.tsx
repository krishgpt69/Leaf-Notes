import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useStore } from '../lib/store';
import { db } from '../lib/db';
import { Sun, Moon, Monitor, X, Download, Upload, Shield, CheckCircle, AlertTriangle, Loader } from 'lucide-react';

type BackupStatus = 'idle' | 'exporting' | 'importing' | 'success' | 'error';

function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function ActivityHeatmap() {
  const [activity, setActivity] = useState<Map<string, number>>(new Map());

  // Load last 60 days
  const loadActivity = useCallback(async () => {
    const data = await db.activity.orderBy('date').reverse().limit(60).toArray();
    const map = new Map<string, number>();
    data.forEach(d => map.set(d.date, d.notesEdited));
    setActivity(map);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadActivity();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadActivity]);

  // Generate last 60 days array
  const days = [];
  const today = new Date();
  for (let i = 59; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(localDateKey(d));
  }

  const getIntensity = (count: number) => {
    if (count === 0) return 'level-0';
    if (count <= 2) return 'level-1';
    if (count <= 5) return 'level-2';
    if (count <= 10) return 'level-3';
    return 'level-4';
  };

  return (
    <div className="activity-heatmap">
      <div className="heatmap-grid">
        {days.map(date => {
          const count = activity.get(date) || 0;
          return (
            <div
              key={date}
              className={`heatmap-cell ${getIntensity(count)}`}
              title={`${date}: ${count} edits`}
            />
          );
        })}
      </div>
      <div className="heatmap-legend">
        <span>Less</span>
        <div className="heatmap-cell level-0" />
        <div className="heatmap-cell level-1" />
        <div className="heatmap-cell level-2" />
        <div className="heatmap-cell level-3" />
        <div className="heatmap-cell level-4" />
        <span>More</span>
      </div>

      <style>{`
        .activity-heatmap {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin: 4px 0;
          align-items: center;
        }
        .heatmap-grid {
          display: grid;
          grid-template-columns: repeat(20, 1fr);
          grid-template-rows: repeat(3, 1fr);
          gap: 5px;
          grid-auto-flow: column;
        }
        .heatmap-cell {
          width: 13px;
          height: 13px;
          border-radius: 2px;
          background: var(--color-surface-3);
          transition: transform 0.2s var(--spring-snappy), background-color 0.2s var(--spring-snappy), box-shadow 0.2s var(--spring-snappy);
          will-change: transform;
        }
        .heatmap-cell:hover {
          transform: scale(1.3);
          z-index: 2;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .heatmap-cell.level-0 { background: var(--color-surface-3); }
        .heatmap-cell.level-1 { background: rgba(255, 152, 0, 0.25); }
        .heatmap-cell.level-2 { background: rgba(255, 152, 0, 0.45); }
        .heatmap-cell.level-3 { background: rgba(255, 152, 0, 0.7); }
        .heatmap-cell.level-4 { background: rgba(255, 152, 0, 1); }
        
        .heatmap-legend {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: var(--color-text-4);
          width: 100%;
          justify-content: center;
          margin-top: 4px;
        }
        .heatmap-legend .heatmap-cell {
          width: 9px;
          height: 9px;
        }
        .heatmap-legend span {
          margin: 0 4px;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}

export default function SettingsPanel() {
  const theme = useStore((s) => s.theme);
  const accentColor = useStore((s) => s.accentColor);
  const editorFontSize = useStore((s) => s.editorFontSize);
  const editorLineHeight = useStore((s) => s.editorLineHeight);
  const editorContentWidth = useStore((s) => s.editorContentWidth);
  const setTheme = useStore((s) => s.setTheme);
  const monochromeMode = useStore((s) => s.monochromeMode);
  const toggleMonochromeMode = useStore((s) => s.toggleMonochromeMode);
  const setAccentColor = useStore((s) => s.setAccentColor);
  const setEditorFontSize = useStore((s) => s.setEditorFontSize);
  const setEditorLineHeight = useStore((s) => s.setEditorLineHeight);
  const setEditorContentWidth = useStore((s) => s.setEditorContentWidth);
  const resetEditorPreferences = useStore((s) => s.resetEditorPreferences);
  const setActiveSection = useStore((s) => s.setActiveSection);
  const refreshNotes = useStore((s) => s.refreshNotes);

  const [backupStatus, setBackupStatus] = useState<BackupStatus>('idle');
  const [backupMessage, setBackupMessage] = useState('');
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const widthOptions = useMemo(() => getContentWidthOptions(viewportWidth), [viewportWidth]);
  const activeWidthOption = widthOptions.find((option) => option.width === editorContentWidth);

  // ─── Export all data as JSON ───
  const exportBackup = useCallback(async () => {
    setBackupStatus('exporting');
    try {
      const notes = await db.notes.toArray();
      const folders = await db.folders.toArray();
      const versions = await db.versions.toArray();
      const settings = await db.settings.toArray();
      // Stickers: store metadata only, blobs as base64
      const stickersRaw = await db.stickers.toArray();
      const stickers = await Promise.all(
        stickersRaw.map(async (s) => {
          const stickerB64 = await blobToBase64(s.stickerBlob);
          return {
            id: s.id,
            name: s.name,
            thumbnailUrl: s.thumbnailUrl,
            width: s.width,
            height: s.height,
            createdAt: s.createdAt,
            stickerBase64: stickerB64,
          };
        })
      );

      const backup = {
        version: 2,
        app: 'Leaf',
        exportedAt: new Date().toISOString(),
        data: { notes, folders, versions, settings, stickers },
      };

      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leaf-backup-${localDateKey(new Date())}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setBackupStatus('success');
      setBackupMessage(`Exported ${notes.length} notes, ${folders.length} folders, ${stickers.length} stickers`);
      setTimeout(() => setBackupStatus('idle'), 4000);
    } catch (err) {
      console.error('Export failed:', err);
      setBackupStatus('error');
      setBackupMessage('Export failed. Please try again.');
      setTimeout(() => setBackupStatus('idle'), 4000);
    }
  }, []);

  // ─── Import from backup JSON ───
  const importBackup = useCallback(
    async (file: File) => {
      setBackupStatus('importing');
      try {
        const text = await file.text();
        const backup = JSON.parse(text);

        if (!backup.app || backup.app !== 'Leaf') {
          throw new Error('Not a valid Leaf backup file');
        }

        const { notes, folders, versions, settings, stickers } = backup.data;

        // Clear existing data and import
        await db.transaction(
          'rw',
          [db.notes, db.folders, db.versions, db.settings, db.stickers, db.activity],
          async () => {
            // Notes
            if (notes?.length) {
              await db.notes.clear();
              await db.notes.bulkPut(notes);
            }
            // Folders
            if (folders?.length) {
              await db.folders.clear();
              await db.folders.bulkPut(folders);
            }
            // Versions
            if (versions?.length) {
              await db.versions.clear();
              await db.versions.bulkPut(versions);
            }
            // Settings
            if (settings?.length) {
              await db.settings.clear();
              await db.settings.bulkPut(settings);
            }
            // Stickers (convert base64 back to blobs)
            if (stickers?.length) {
              await db.stickers.clear();
              for (const s of stickers) {
                const stickerBlob = base64ToBlob(s.stickerBase64, 'image/png');
                await db.stickers.put({
                  id: s.id,
                  name: s.name,
                  originalBlob: stickerBlob, // use sticker as original too
                  stickerBlob,
                  thumbnailUrl: s.thumbnailUrl,
                  width: s.width,
                  height: s.height,
                  createdAt: s.createdAt,
                });
              }
            }
          }
        );

        await refreshNotes();

        const nc = notes?.length || 0;
        const sc = stickers?.length || 0;
        setBackupStatus('success');
        setBackupMessage(`Restored ${nc} notes, ${folders?.length || 0} folders, ${sc} stickers`);
        setTimeout(() => setBackupStatus('idle'), 4000);
      } catch (err) {
        console.error('Import failed:', err);
        setBackupStatus('error');
        setBackupMessage(
          err instanceof Error ? err.message : 'Import failed. Check your backup file.'
        );
        setTimeout(() => setBackupStatus('idle'), 4000);
      }
    },
    [refreshNotes]
  );

  return (
    <div className="settings-panel acrylic animate-in">
      <div className="settings-header">
        <h2 className="settings-title">Settings</h2>
        <button className="settings-close" onClick={() => setActiveSection('notes')}>
          <X size={18} />
        </button>
      </div>

      <div className="settings-content">
        {/* Appearance */}
        <section className="settings-section">
          <h3 className="settings-section-title">Appearance</h3>
          <div className="settings-field">
            <label className="settings-label">Theme</label>
            <div className="theme-cards">
              {([
                { id: 'light' as const, label: 'Light', icon: Sun },
                { id: 'dark' as const, label: 'Dark', icon: Moon },
                { id: 'system' as const, label: 'System', icon: Monitor },
              ]).map((t) => (
                <button
                  key={t.id}
                  className={`theme-card ${theme === t.id ? 'active' : ''}`}
                  onClick={() => setTheme(t.id)}
                >
                  <t.icon size={20} />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="settings-field">
            <label className="settings-label">Accent Color</label>
            <div className="accent-colors">
              {[
                { id: 'green', color: 'hsl(142 71% 45%)' },
                { id: 'blue', color: 'hsl(217 91% 60%)' },
                { id: 'purple', color: 'hsl(250 89% 65%)' },
                { id: 'rose', color: 'hsl(346 87% 60%)' },
                { id: 'orange', color: 'hsl(24 94% 50%)' },
              ].map((c) => (
                <button
                  key={c.id}
                  className={`accent-color-btn ${accentColor === c.color ? 'active' : ''}`}
                  style={{ backgroundColor: c.color }}
                  onClick={() => setAccentColor(c.color)}
                  title={c.id}
                >
                  {accentColor === c.color && <CheckCircle size={14} color="white" />}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-field">
            <div className="settings-label-col">
              <label className="settings-label">Monochrome Mode</label>
              <p className="settings-field-desc">Focus mode. Removes all color from the UI.</p>
            </div>
            <div className="settings-control-col">
              <button
                className={`mono-toggle ${monochromeMode ? 'active' : ''}`}
                onClick={toggleMonochromeMode}
                aria-pressed={monochromeMode}
              >
                <div className="mono-toggle-thumb" />
              </button>
            </div>
          </div>
        </section>

        {/* Editor */}
        <section className="settings-section">
          <div className="settings-section-head">
            <h3 className="settings-section-title">Editor</h3>
            <button
              type="button"
              className="settings-reset-btn"
              onClick={resetEditorPreferences}
            >
              Default
            </button>
          </div>
          <div className="settings-field">
            <div className="settings-label-col">
              <label className="settings-label">Editor font size</label>
              <p className="settings-field-desc">Reading size for raw editing and preview. Range: 14px to 18px.</p>
            </div>
            <div className="settings-control-col settings-control-stack">
              <div className="settings-range-row">
                <input
                  className="settings-range"
                  type="range"
                  min={14}
                  max={18}
                  step={1}
                  value={editorFontSize}
                  onChange={(e) => setEditorFontSize(Number(e.target.value))}
                />
                <span className="settings-value settings-value-pill">{editorFontSize}px</span>
              </div>
            </div>
          </div>
          <div className="settings-field">
            <div className="settings-label-col">
              <label className="settings-label">Line height</label>
              <p className="settings-field-desc">Controls reading density. Range: 0.75 to 2.5.</p>
            </div>
            <div className="settings-control-col settings-control-stack">
              <div className="settings-range-row">
                <input
                  className="settings-range"
                  type="range"
                  min={0.75}
                  max={2.5}
                  step={0.05}
                  value={editorLineHeight}
                  onChange={(e) => setEditorLineHeight(Number(e.target.value))}
                />
                <span className="settings-value settings-value-pill">{editorLineHeight.toFixed(2)}</span>
              </div>
            </div>
          </div>
          <div className="settings-field">
            <div className="settings-label-col">
              <label className="settings-label">Content width</label>
              <p className="settings-field-desc">
                Sized for this display. Choose a narrower reading column or a wider working canvas.
              </p>
            </div>
            <div className="settings-control-col settings-control-stack">
              <div className="settings-option-grid">
                {widthOptions.map((option) => (
                  <button
                    key={option.id}
                    className={`settings-option-card ${editorContentWidth === option.width ? 'active' : ''}`}
                    onClick={() => setEditorContentWidth(option.width)}
                    type="button"
                  >
                    <span className="settings-option-title">{option.label}</span>
                    <span className="settings-option-meta">{option.width}px</span>
                    <span className="settings-option-copy">{option.description}</span>
                  </button>
                ))}
              </div>
              <span className="settings-value">
                Active width: {editorContentWidth}px{activeWidthOption ? ` · ${activeWidthOption.label}` : ''}
              </span>
            </div>
          </div>
        </section>

        {/* Activity & Streaks */}
        <section className="settings-section">
          <h3 className="settings-section-title">Activity & Streaks</h3>
          <div className="settings-grid-field">
            <div className="settings-label-col">
              <label className="settings-label">Activity Heatmap</label>
              <p className="settings-field-desc">Your editing habits over the last 60 days.</p>
            </div>
            <div className="settings-control-col">
              <ActivityHeatmap />
            </div>
          </div>
        </section>

        {/* Data & Backup */}
        <section className="settings-section">
          <h3 className="settings-section-title">
            <Shield size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Data & Backup
          </h3>
          <p className="settings-desc">
            Your data is stored locally in your browser with persistent storage enabled.
            Create backups regularly to keep your notes safe.
          </p>

          <div className="backup-actions">
            <button className="backup-btn export" onClick={exportBackup} disabled={backupStatus === 'exporting'}>
              {backupStatus === 'exporting' ? (
                <Loader size={16} className="spin" />
              ) : (
                <Download size={16} />
              )}
              Export Backup
            </button>

            <button
              className="backup-btn import"
              onClick={() => fileInputRef.current?.click()}
              disabled={backupStatus === 'importing'}
            >
              {backupStatus === 'importing' ? (
                <Loader size={16} className="spin" />
              ) : (
                <Upload size={16} />
              )}
              Restore from Backup
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importBackup(f);
                e.target.value = '';
              }}
            />
          </div>

          {backupStatus === 'success' && (
            <div className="backup-feedback success">
              <CheckCircle size={14} />
              {backupMessage}
            </div>
          )}
          {backupStatus === 'error' && (
            <div className="backup-feedback error">
              <AlertTriangle size={14} />
              {backupMessage}
            </div>
          )}
        </section>

        {/* About */}
        <section className="settings-section">
          <h3 className="settings-section-title">About</h3>
          <p className="settings-about">
            <strong>Leaf</strong> v1.0.0<br />
            Write instantly. Find anything. Own your data.<br /><br />
            All notes stored locally in your browser.<br />
            No account required. No data leaves your device.
          </p>
        </section>
      </div>

      <style>{`
        .settings-panel {
          flex: 1;
          height: 100%;
          display: flex;
          flex-direction: column;
          border-radius: var(--radius-lg);
          min-width: 0;
          overflow: hidden;
        }
        .settings-header {
          height: 80px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 40px;
          border-bottom: 1px solid var(--color-border);
        }
        .settings-title {
          font-family: var(--font-display);
          font-size: 32px;
          color: var(--color-text-1);
          font-weight: 400;
          font-style: italic;
        }
        .settings-close {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: transparent;
          color: var(--color-text-3);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: background-color var(--dur-fast), color var(--dur-fast);
        }
        .settings-close:hover {
          background: var(--color-surface-2);
          color: var(--color-text-1);
        }
        .settings-content {
          flex: 1;
          overflow-y: auto;
          padding: 40px 60px;
          width: 100%;
          max-width: 900px;
          margin: 0 auto;
        }
        .settings-section {
          margin-bottom: 48px;
        }
        .settings-section-title {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--color-text-4);
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          border-bottom: 1px solid var(--color-border);
          padding-bottom: 8px;
        }
        .settings-desc {
          font-size: var(--text-sm);
          color: var(--color-text-3);
          line-height: 1.6;
          margin-bottom: 20px;
        }
        .settings-grid-field {
          display: grid;
          grid-template-columns: 180px 1fr;
          gap: 48px;
          padding: 24px 0;
          align-items: start;
        }
        .settings-field {
          display: grid;
          grid-template-columns: 180px 1fr;
          gap: 48px;
          padding: 24px 0;
          border-bottom: 1px solid var(--color-border);
          align-items: center;
        }
        .settings-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .settings-reset-btn {
          padding: 7px 12px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-full);
          background: var(--color-surface);
          color: var(--color-text-2);
          font-size: 12px;
          font-family: var(--font-ui);
          font-weight: 600;
          cursor: pointer;
          transition: border-color var(--dur-fast), background-color var(--dur-fast), color var(--dur-fast);
        }
        .settings-reset-btn:hover {
          border-color: var(--color-accent);
          background: var(--color-accent-light);
          color: var(--color-accent);
        }
        .settings-label {
          font-size: 14px;
          font-weight: 500;
          color: var(--color-text-1);
        }
        .settings-field-desc {
          font-size: 12px;
          color: var(--color-text-4);
          line-height: 1.5;
          margin-top: 4px;
        }
        .settings-value {
          font-size: var(--text-sm);
          color: var(--color-text-3);
        }
        .settings-control-stack {
          display: flex;
          flex-direction: column;
          gap: 14px;
          min-width: 0;
        }
        .settings-range-row {
          display: flex;
          align-items: center;
          gap: 14px;
          min-width: 0;
        }
        .settings-range {
          width: min(360px, 100%);
          accent-color: var(--color-accent);
        }
        .settings-value-pill {
          min-width: 72px;
          text-align: center;
          padding: 8px 12px;
          border-radius: var(--radius-full);
          border: 1px solid var(--color-border);
          background: var(--color-surface);
          color: var(--color-text-2);
        }
        .settings-option-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 10px;
          width: 100%;
        }
        .settings-option-card {
          display: grid;
          gap: 4px;
          padding: 14px 16px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          background: var(--color-surface);
          color: var(--color-text-2);
          text-align: left;
          cursor: pointer;
          transition: border-color var(--dur-fast), background-color var(--dur-fast), transform var(--dur-fast), box-shadow var(--dur-fast);
        }
        .settings-option-card:hover {
          border-color: var(--color-border-strong);
          transform: translateY(-1px);
        }
        .settings-option-card.active {
          border-color: var(--color-accent);
          background: var(--color-accent-light);
          box-shadow: var(--shadow-sm);
        }
        .settings-option-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--color-text-1);
        }
        .settings-option-meta {
          font-size: 12px;
          color: var(--color-text-3);
        }
        .settings-option-copy {
          font-size: 12px;
          line-height: 1.45;
          color: var(--color-text-4);
        }
        .theme-cards {
          display: flex;
          gap: 8px;
        }
        .theme-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 16px 24px;
          border: 1.5px solid var(--color-border);
          border-radius: var(--radius-lg);
          background: var(--color-surface);
          color: var(--color-text-2);
          cursor: pointer;
          font-size: var(--text-sm);
          font-family: var(--font-ui);
          transition: border-color var(--dur-fast), background-color var(--dur-fast), color var(--dur-fast), transform var(--dur-fast);
        }
        .theme-card:hover {
          border-color: var(--color-border-strong);
        }
        .theme-card.active {
          border-color: var(--color-accent);
          background: var(--color-accent-light);
          color: var(--color-accent);
        }
        
        .accent-colors {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .accent-color-btn {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 2px solid transparent;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform var(--dur-fast), border-color var(--dur-fast);
          box-shadow: var(--shadow-sm);
        }
        .accent-color-btn:hover {
          transform: scale(1.1);
        }
        .accent-color-btn.active {
          border-color: var(--color-text-1);
          transform: scale(1.1);
        }

        /* Mono Toggle - Premium */
        .mono-toggle {
          width: 50px;
          height: 28px;
          border-radius: 14px;
          background: rgba(120, 120, 120, 0.15);
          border: 1px solid var(--color-border);
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
          cursor: pointer;
          position: relative;
          transition: background-color 0.4s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.4s ease;
          overflow: hidden;
        }
        .mono-toggle.active {
          background: #111;
          border-color: rgba(255,255,255,0.1);
        }
        .mono-toggle::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.15), transparent);
          opacity: 0;
          transition: opacity 0.4s ease;
        }
        .mono-toggle.active::before {
          opacity: 1;
        }
        .mono-toggle-thumb {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: linear-gradient(to bottom, #ffffff, #e0e0e0);
          box-shadow: 0 2px 5px rgba(0,0,0,0.2), inset 0 -1px 1px rgba(0,0,0,0.05);
          transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), background 0.4s ease;
          z-index: 2;
        }
        .mono-toggle.active .mono-toggle-thumb {
          transform: translateX(22px);
          background: linear-gradient(to bottom, #444, #222);
          box-shadow: 0 2px 5px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.2);
        }

        /* Backup section */
        .backup-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .backup-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          border: 1.5px solid var(--color-border);
          border-radius: var(--radius-md);
          background: var(--color-surface);
          color: var(--color-text-2);
          font-size: var(--text-sm);
          font-family: var(--font-ui);
          font-weight: 500;
          cursor: pointer;
          transition: border-color var(--dur-fast), background-color var(--dur-fast), color var(--dur-fast), transform var(--dur-fast);
        }
        .backup-btn:hover:not(:disabled) {
          border-color: var(--color-accent);
          color: var(--color-accent);
          background: var(--color-accent-light);
        }
        .backup-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .backup-btn.export {
          background: var(--color-accent);
          color: white;
          border-color: var(--color-accent);
        }
        .backup-btn.export:hover:not(:disabled) {
          background: var(--color-accent-hover);
          color: white;
        }
        .backup-feedback {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          padding: 10px 14px;
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
          animation: fadeIn 200ms ease;
        }
        .backup-feedback.success {
          background: hsl(142 40% 94%);
          color: hsl(142 60% 35%);
          border: 1px solid hsl(142 40% 85%);
        }
        .backup-feedback.error {
          background: hsl(0 40% 95%);
          color: hsl(0 60% 45%);
          border: 1px solid hsl(0 40% 88%);
        }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } }

        .settings-about {
          font-size: var(--text-sm);
          color: var(--color-text-3);
          line-height: 1.7;
        }
      `}</style>
    </div>
  );
}

// ─── Helpers ───

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(dataUrl: string, type: string): Blob {
  const parts = dataUrl.split(',');
  const byteString = atob(parts[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type });
}

function getContentWidthOptions(viewportWidth: number) {
  const gutter = viewportWidth < 900 ? 80 : 160;
  const usableWidth = Math.max(520, viewportWidth - gutter);
  const candidates = [
    {
      id: 'focused',
      label: 'Focused',
      width: clampWidth(Math.min(640, usableWidth * 0.72), usableWidth),
      description: 'Best for long-form reading and distraction-free writing.',
    },
    {
      id: 'balanced',
      label: 'Balanced',
      width: clampWidth(Math.min(760, usableWidth * 0.84), usableWidth),
      description: 'A comfortable middle ground for most notes.',
    },
    {
      id: 'spacious',
      label: 'Spacious',
      width: clampWidth(Math.min(920, usableWidth), usableWidth),
      description: 'Wider canvas for dense notes, tables, and embeds.',
    },
  ];

  return candidates.filter((option, index, all) => all.findIndex((item) => item.width === option.width) === index);
}

function clampWidth(value: number, maxWidth: number) {
  return Math.round(Math.max(520, Math.min(value, maxWidth)));
}
