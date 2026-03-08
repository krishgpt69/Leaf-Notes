import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useStore } from '../lib/store';
import { db } from '../lib/db';
import { buildStreakRuns, parseLocalDateKey } from '../lib/streak-utils';
import {
  FileText,
  Search,
  Hash,
  Download,
  Settings,
  Flame,
  Scissors,
  Brain
} from 'lucide-react';

const railItems = [
  { id: 'notes' as const, icon: FileText, label: 'Notes', shortcut: '' },
  { id: 'search' as const, icon: Search, label: 'Search', shortcut: '⌘K' },
  { id: 'tags' as const, icon: Hash, label: 'Tags', shortcut: '' },
  { id: 'intelligence' as const, icon: Brain, label: 'Intelligence', shortcut: '' },
  { id: 'import' as const, icon: Download, label: 'Import', shortcut: '' },
  { id: 'stickers' as const, icon: Scissors, label: 'Stickers', shortcut: '' },
];

function formatDateLabel(date: string) {
  const parsed = parseLocalDateKey(date);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(parsed);
}

export default memo(function AppRail() {
  const activeSection = useStore((s) => s.activeSection);
  const setActiveSection = useStore((s) => s.setActiveSection);
  const toggleCommandPalette = useStore((s) => s.toggleCommandPalette);
  const streak = useStore((s) => s.streak);
  const todayActive = useStore((s) => s.todayActive);
  const [showStreakHistory, setShowStreakHistory] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<{ top: number; left: number; opacity: number }>({ top: 0, left: 0, opacity: 0 });
  const streakBtnRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const activityRecords = useLiveQuery(() => db.activity.toArray(), []);

  const previousStreaks = useMemo(() => {
    if (!showStreakHistory) return [] as { start: string; end: string; length: number }[];
    const runs = buildStreakRuns(activityRecords || [], streak, todayActive);
    return runs.filter((r) => !r.isCurrent);
  }, [showStreakHistory, activityRecords, streak, todayActive]);

  const bestPreviousStreak = useMemo(
    () => previousStreaks.reduce((max, run) => Math.max(max, run.length), 0),
    [previousStreaks]
  );

  useEffect(() => {
    if (!showStreakHistory || !streakBtnRef.current || !popoverRef.current) return;

    const updatePosition = () => {
      if (!streakBtnRef.current || !popoverRef.current) return;
      const anchor = streakBtnRef.current.getBoundingClientRect();
      const pop = popoverRef.current.getBoundingClientRect();
      const gap = 10;
      const pad = 10;

      let left = anchor.right + gap;
      if (left + pop.width > window.innerWidth - pad) {
        left = anchor.left - pop.width - gap;
      }
      left = Math.max(pad, Math.min(left, window.innerWidth - pop.width - pad));

      let top = anchor.top + anchor.height / 2 - pop.height / 2;
      top = Math.max(pad, Math.min(top, window.innerHeight - pop.height - pad));

      setPopoverStyle({ top, left, opacity: 1 });
    };

    updatePosition();
    requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition, { passive: true });
    window.addEventListener('scroll', updatePosition, { passive: true, capture: true });
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [showStreakHistory, previousStreaks.length]);

  useEffect(() => {
    if (!showStreakHistory) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target) || streakBtnRef.current?.contains(target)) return;
      setShowStreakHistory(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowStreakHistory(false);
    };
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [showStreakHistory]);

  return (
    <nav className="app-rail acrylic animate-in">
      {/* Logo */}
      <div className="rail-logo" title="Leaf">
        <span className="rail-logo-icon">🍃</span>
      </div>

      {/* Main nav */}
      <div className="rail-nav">
        {railItems.map((item) => (
          <button
            key={item.id}
            className={`rail-btn ${activeSection === item.id ? 'active' : ''}`}
            onClick={() => {
              if (item.id === 'search') {
                toggleCommandPalette();
              } else {
                setActiveSection(item.id);
              }
            }}
            title={`${item.label}${item.shortcut ? ` (${item.shortcut})` : ''}`}
          >
            <item.icon size={18} />
            <span className="rail-tooltip">{item.label}</span>
          </button>
        ))}
      </div>

      {/* Bottom (Streak + Settings) */}
      <div className="rail-bottom">
        {/* SVG definition for fire gradient */}
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <defs>
            <linearGradient id="fire-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ea580c" />
              <stop offset="50%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#fbbf24" />
            </linearGradient>
          </defs>
        </svg>

        <button
          ref={streakBtnRef}
          type="button"
          className={`rail-btn rail-streak ${todayActive ? 'active-streak' : ''}`}
          title={`Current Streak: ${streak} days`}
          onClick={() => setShowStreakHistory((v) => !v)}
        >
          <Flame
            size={18}
            stroke={todayActive ? "url(#fire-gradient)" : "currentColor"}
          />
          <span className="streak-count">{streak}</span>

          <span className="rail-tooltip">Show previous streaks</span>
        </button>

        <button
          className={`rail-btn ${activeSection === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveSection('settings')}
          title="Settings"
        >
          <Settings size={18} />
          <span className="rail-tooltip">Settings</span>
        </button>
      </div>

      {showStreakHistory && typeof document !== 'undefined' && createPortal(
        <div
          className="rail-streak-popover"
          ref={popoverRef}
          style={{ position: 'fixed', top: popoverStyle.top, left: popoverStyle.left, opacity: popoverStyle.opacity, zIndex: 1400 }}
          role="dialog"
          aria-modal="false"
          aria-label="Previous streaks"
        >
          <div className="rail-streak-popover-title">Previous Streaks</div>
          <div className="rail-streak-popover-subtitle">
            Current: <strong>{streak}d</strong> • Best previous: <strong>{bestPreviousStreak}d</strong>
          </div>
          {previousStreaks.length === 0 ? (
            <p className="rail-streak-empty">No previous streaks yet.</p>
          ) : (
            <ul className="rail-streak-list">
              {previousStreaks.slice(0, 8).map((run, i) => (
                <li key={`${run.start}-${i}`}>
                  <span className="days">{run.length}d</span>
                  <span className="range">{formatDateLabel(run.start)} to {formatDateLabel(run.end)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>,
        document.body
      )}

      <style>{`
        .app-rail {
          width: var(--rail-width);
          height: 100%;
          border-radius: var(--radius-full);
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 16px 0;
          gap: 4px;
          z-index: 10;
        }
        .rail-logo {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 8px;
          cursor: default;
        }
        .rail-logo-icon {
          font-size: 22px;
        }
        .rail-nav {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          flex: 1;
        }
        .rail-bottom {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }
        .rail-btn {
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: transparent;
          color: var(--color-text-3);
          border-radius: var(--radius-md);
          cursor: pointer;
          position: relative;
          transition: background var(--dur-fast) var(--spring-snappy),
                      color var(--dur-fast) var(--spring-snappy);
        }
        .rail-btn:hover {
          background: var(--color-surface-3);
          color: var(--color-text-2);
        }
        .rail-btn.active {
          background: var(--color-accent-light);
          color: var(--color-accent);
        }
        .rail-tooltip {
          display: none;
          position: absolute;
          left: calc(100% + 8px);
          background: var(--color-text-1);
          color: var(--color-surface);
          font-size: var(--text-xs);
          padding: 4px 8px;
          border-radius: var(--radius-sm);
          white-space: nowrap;
          pointer-events: none;
          z-index: 100;
        }
        .rail-btn:hover .rail-tooltip {
          display: block;
        }

        /* Streak Counter */
        .rail-streak {
          position: relative;
          color: var(--color-text-4);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          height: auto;
          padding: 6px 0;
          margin-bottom: 8px;
        }
        .rail-streak:hover {
          background: var(--color-surface-3);
        }
        .streak-count {
          font-size: 10px;
          font-weight: 700;
          font-family: var(--font-ui);
          opacity: 0.5;
        }
        .rail-streak.active-streak {
          color: #f97316;
        }
        .rail-streak.active-streak .streak-count {
          opacity: 1;
          color: transparent;
          background: linear-gradient(to top, #ea580c, #f97316, #fbbf24);
          -webkit-background-clip: text;
          background-clip: text;
        }
        .rail-streak.active-streak svg {
          filter: drop-shadow(0 0 6px rgba(249, 115, 22, 0.6));
          animation: pulse-flame 2s infinite ease-in-out;
        }
        @keyframes pulse-flame {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); filter: drop-shadow(0 0 10px rgba(234, 88, 12, 0.8)); }
        }

        .rail-streak-popover {
          width: min(320px, calc(100vw - 20px));
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-lg);
          padding: 12px;
          backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
          -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
        }
        .rail-streak-popover-title {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: var(--color-text-4);
          margin-bottom: 4px;
        }
        .rail-streak-popover-subtitle {
          font-size: 11px;
          color: var(--color-text-3);
          margin-bottom: 8px;
        }
        .rail-streak-empty {
          margin: 0;
          font-size: 12px;
          color: var(--color-text-3);
        }
        .rail-streak-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .rail-streak-list li {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: var(--color-text-2);
          padding: 6px 8px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--color-surface-3);
          background: color-mix(in srgb, var(--color-surface-2) 75%, transparent);
        }
        .rail-streak-list .days {
          font-weight: 700;
          color: var(--color-accent);
          min-width: 26px;
        }
        .rail-streak-list .range {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </nav>
  );
});
