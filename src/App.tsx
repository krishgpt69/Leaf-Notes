import { useEffect, useState, Suspense, lazy, type ComponentType } from 'react';

import { useStore } from './lib/store';
import AppRail from './components/AppRail';
import Sidebar from './components/Sidebar/Sidebar';
import EditorPanel from './components/Editor/EditorPanel';
import CommandPalette from './components/CommandPalette';
import QuickCapture from './components/QuickCapture';
import { ToastProvider } from './components/Toast';
import { PanelLeft, FileText, Tag, Download, Settings, Search, Scissors, MoreHorizontal, Brain } from 'lucide-react';
import { useHotkeys } from './hooks/useHotkeys';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';
type LazyPreload<T extends ComponentType<object>> = React.LazyExoticComponent<T> & {
  preload: () => Promise<{ default: T }>;
};

function lazyWithPreload<T extends ComponentType<object>>(factory: () => Promise<{ default: T }>): LazyPreload<T> {
  const Component = lazy(factory) as LazyPreload<T>;
  Component.preload = factory;
  return Component;
}

// Lazy load heavy secondary panels to keep the main bundle extremely small
const SettingsPanel = lazyWithPreload(() => import('./components/SettingsPanel'));
const TagsPanel = lazyWithPreload(() => import('./components/TagsPanel'));
const ImportPanel = lazyWithPreload(() => import('./components/ImportPanel'));
const StickersPanel = lazyWithPreload(() => import('./components/StickersPanel'));
const SearchPanel = lazyWithPreload(() => import('./components/SearchPanel'));
const IntelligenceDashboard = lazyWithPreload(() => import('./components/AI/IntelligenceDashboard'));

export default function App() {
  const initialize = useStore((s) => s.initialize);
  const initialized = useStore((s) => s.initialized);
  const focusMode = useStore((s) => s.focusMode);
  const activeSection = useStore((s) => s.activeSection);
  const setActiveSection = useStore((s) => s.setActiveSection);
  const createNote = useStore((s) => s.createNote);
  const toggleCommandPalette = useStore((s) => s.toggleCommandPalette);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const theme = useStore((s) => s.theme);
  const monochromeMode = useStore((s) => s.monochromeMode);
  const setResolvedTheme = useStore((s) => s.setResolvedTheme);
  const refreshStreak = useStore((s) => s.refreshStreak);
  const pastActionsCount = useStore(s => s.pastActions.length);
  const futureActionsCount = useStore(s => s.futureActions.length);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [isCompactShell, setIsCompactShell] = useState(() => window.innerWidth <= 1024);
  const prefersReducedMotion = usePrefersReducedMotion();
  const panelAnimationClass = prefersReducedMotion
    ? 'panel-transition-wrapper h-full overflow-y-auto'
    : 'panel-transition-wrapper animate-in fade-in slide-in-from-bottom-4 duration-300 h-full overflow-y-auto';
  const editorAnimationClass = prefersReducedMotion
    ? 'panel-transition-wrapper'
    : 'panel-transition-wrapper animate-in fade-in zoom-in-95 duration-300';

  // Initialize DB and load data
  useEffect(() => {
    initialize();
    navigator.storage?.persist?.();
  }, [initialize]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1024px)');
    const syncShell = () => {
      const nextIsCompact = mediaQuery.matches;
      setIsCompactShell(nextIsCompact);
      if (!nextIsCompact) {
        window.setTimeout(() => setMobileSidebarOpen(false), 0);
      }
    };
    syncShell();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncShell);
      return () => mediaQuery.removeEventListener('change', syncShell);
    }

    mediaQuery.addListener(syncShell);
    return () => mediaQuery.removeListener(syncShell);
  }, []);

  // Preload secondary panels after first paint to keep transitions instant
  useEffect(() => {
    const preloadPanels = () => {
      SettingsPanel.preload();
      TagsPanel.preload();
      ImportPanel.preload();
      StickersPanel.preload();
      SearchPanel.preload();
      IntelligenceDashboard.preload();
      void import('./lib/stickerWorker')
        .then(({ warmStickerEngine }) => warmStickerEngine())
        .catch(() => {
          // Sticker engine warmup is opportunistic.
        });
    };

    const win = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof win.requestIdleCallback === 'function') {
      const id = win.requestIdleCallback(preloadPanels, { timeout: 2000 });
      return () => win.cancelIdleCallback?.(id);
    }

    const timeout = globalThis.setTimeout(preloadPanels, 1200);
    return () => globalThis.clearTimeout(timeout);
  }, []);

  // Listen for OS theme changes dynamically (with Safari fallback)
  useEffect(() => {
    if (theme !== 'system') return undefined;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const syncTheme = () => {
      setResolvedTheme(mediaQuery.matches ? 'dark' : 'light');
    };

    // Sync immediately on mount for system theme
    syncTheme();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncTheme);
      return () => mediaQuery.removeEventListener('change', syncTheme);
    }

    // Safari < 14
    if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(syncTheme);
      return () => mediaQuery.removeListener(syncTheme);
    }

    return undefined;
  }, [theme, setResolvedTheme]);

  // Keep streak state consistent across day rollovers
  useEffect(() => {
    let lastKey = new Date().toDateString();
    const tick = () => {
      const key = new Date().toDateString();
      if (key !== lastKey) {
        lastKey = key;
        refreshStreak();
      }
    };
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [refreshStreak]);

  // Handle monochrome mode on html element to sync with fast-boot script
  useEffect(() => {
    if (monochromeMode) {
      document.documentElement.classList.add('theme-monochrome');
    } else {
      document.documentElement.classList.remove('theme-monochrome');
    }
  }, [monochromeMode]);

  // Global keyboard shortcuts
  useHotkeys({
    'Cmd+N': () => createNote(),
    'Cmd+K': () => toggleCommandPalette(),
    'Cmd+\\': () => toggleSidebar(),
    'Cmd+Z': () => {
      if (pastActionsCount > 0) undo();
    },
    'Cmd+Shift+Z': () => {
      if (futureActionsCount > 0) redo();
    },
    'Esc': () => {
      // Clear selection or close modals if needed.
      // Handled locally in components mostly, but can add global escapes here
    }
  }, [createNote, toggleCommandPalette, toggleSidebar, undo, redo, pastActionsCount, futureActionsCount]);

  // Loading state (Structure Skeleton)
  if (!initialized) {
    return (
      <div className="skeleton-shell">
        <div className="loader-content">
          <div className="loader-logo">🍃</div>
          <svg className="loader-spinner" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>
        <style>{`
          .skeleton-shell {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100vw;
            height: 100dvh;
            background-color: var(--mesh-bg-main);
            position: fixed;
            inset: 0;
            z-index: 10000;
          }
          .loader-content {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
          }
          .loader-logo {
            font-size: 64px;
            animation: breathe 2s infinite ease-in-out;
            user-select: none;
          }
          .loader-spinner {
            color: rgba(150, 150, 150, 0.5);
            animation: spin 1s linear infinite;
          }
          [data-theme="dark"] .loader-spinner {
            color: rgba(255, 255, 255, 0.4);
          }
          @keyframes breathe {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.1); opacity: 0.8; }
          }
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <ToastProvider>
      {/* Mobile sidebar backdrop */}
      {isCompactShell && mobileSidebarOpen && (
        <div className="mobile-sidebar-backdrop" onClick={() => setMobileSidebarOpen(false)} />
      )}
      {isCompactShell && mobileMoreOpen && (
        <div className="mobile-more-backdrop" onClick={() => setMobileMoreOpen(false)} />
      )}

      {/* Global Quick Capture Modal */}
      <QuickCapture />

      <div className="app-layout">
        {/* App Rail — desktop only */}
        {!focusMode && !isCompactShell && <AppRail />}

        {/* Sidebar — desktop: collapsible inline; mobile: drawer overlay */}
        {!focusMode && (
          <div className={`sidebar-wrapper ${mobileSidebarOpen ? 'mobile-open' : ''}`}>
            <Sidebar />
          </div>
        )}

        {activeSection === 'settings' ||
          activeSection === 'tags' ||
          activeSection === 'import' ||
          activeSection === 'search' ||
          activeSection === 'stickers' ||
          activeSection === 'intelligence' ? (
          <Suspense fallback={
            <div className="panel-loading" style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="loader-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                <div className="loader-logo" style={{ fontSize: '64px', animation: prefersReducedMotion ? 'none' : 'breathe 2s infinite ease-in-out', userSelect: 'none' }}>🍃</div>
                <svg className="loader-spinner" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-3)', animation: prefersReducedMotion ? 'none' : 'spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              </div>
            </div>
          }>
            <div className={panelAnimationClass}>
              {activeSection === 'settings' && <SettingsPanel />}
              {activeSection === 'tags' && <TagsPanel />}
              {activeSection === 'import' && <ImportPanel />}
              {activeSection === 'search' && <SearchPanel />}
              {activeSection === 'stickers' && <StickersPanel />}
              {activeSection === 'intelligence' && <IntelligenceDashboard />}
            </div>
          </Suspense>
        ) : (
          <div className={editorAnimationClass}>
            <EditorPanel />
          </div>
        )}

        {/* Command Palette overlay */}
        <CommandPalette />
      </div>



      {/* Mobile Bottom Navigation */}
      {!focusMode && (
        <nav className="mobile-bottom-nav">
          <button
            className={`mobile-nav-btn ${mobileSidebarOpen ? 'active' : ''}`}
            onClick={() => {
              setMobileMoreOpen(false);
              setMobileSidebarOpen(!mobileSidebarOpen);
            }}
            aria-label="Notes"
          >
            <PanelLeft size={22} />
            <span>Notes</span>
          </button>
          <button
            className={`mobile-nav-btn ${activeSection === 'notes' && !mobileSidebarOpen ? 'active' : ''}`}
            onClick={() => { setActiveSection('notes'); setMobileSidebarOpen(false); setMobileMoreOpen(false); }}
            aria-label="Write"
          >
            <FileText size={22} />
            <span>Write</span>
          </button>
          <button
            className={`mobile-nav-btn ${activeSection === 'search' ? 'active' : ''}`}
            onClick={() => { setActiveSection('search'); setMobileSidebarOpen(false); setMobileMoreOpen(false); }}
            aria-label="Search"
          >
            <Search size={22} />
            <span>Search</span>
          </button>
          <button
            className={`mobile-nav-btn ${activeSection === 'stickers' ? 'active' : ''}`}
            onClick={() => { setActiveSection('stickers'); setMobileSidebarOpen(false); setMobileMoreOpen(false); }}
            aria-label="Stickers"
          >
            <Scissors size={22} />
            <span>Stickers</span>
          </button>
          <button
            className={`mobile-nav-btn ${mobileMoreOpen || ['tags', 'import', 'settings', 'intelligence'].includes(activeSection) ? 'active' : ''}`}
            onClick={() => {
              setMobileSidebarOpen(false);
              setMobileMoreOpen(!mobileMoreOpen);
            }}
            aria-label="More"
          >
            <MoreHorizontal size={22} />
            <span>More</span>
          </button>
        </nav>
      )}
      {!focusMode && mobileMoreOpen && (
        <div className="mobile-more-sheet">
          <button className={`mobile-more-item ${activeSection === 'tags' ? 'active' : ''}`} onClick={() => { setActiveSection('tags'); setMobileMoreOpen(false); }}>
            <Tag size={18} />
            <span>Tags</span>
          </button>
          <button className={`mobile-more-item ${activeSection === 'import' ? 'active' : ''}`} onClick={() => { setActiveSection('import'); setMobileMoreOpen(false); }}>
            <Download size={18} />
            <span>Import</span>
          </button>
          <button className={`mobile-more-item ${activeSection === 'intelligence' ? 'active' : ''}`} onClick={() => { setActiveSection('intelligence'); setMobileMoreOpen(false); }}>
            <Brain size={18} />
            <span>Insights</span>
          </button>
          <button className={`mobile-more-item ${activeSection === 'settings' ? 'active' : ''}`} onClick={() => { setActiveSection('settings'); setMobileMoreOpen(false); }}>
            <Settings size={18} />
            <span>Settings</span>
          </button>
        </div>
      )}

      <style>{`
        .app-layout {
          display: flex;
          width: 100%;
          height: 100dvh;
          overflow: hidden;
          background: transparent;
          padding: var(--app-padding);
          gap: var(--app-padding);
        }

        /* ── Desktop sidebar wrapper — inline ── */
        .sidebar-wrapper {
          display: contents;
        }

        .panel-transition-wrapper {
            flex: 1;
            height: 100%;
            display: flex;
            min-width: 0; /* Important for flex children truncating */
            contain: layout paint;
            will-change: transform, opacity;
            transform: translateZ(0);
        }

        /* ── Mobile Bottom Navigation ── */
        .mobile-bottom-nav {
          display: none;
        }

        /* ── Mobile Backdrop ── */
        .mobile-sidebar-backdrop {
          display: none;
        }
        .mobile-more-backdrop,
        .mobile-more-sheet {
          display: none;
        }

        @media (max-width: 1100px) {
          .app-layout {
            padding: 10px;
            gap: 10px;
          }
        }

        @media (max-width: 1024px) {
          .app-layout {
            padding: 0;
            gap: 0;
            padding-bottom: calc(72px + env(safe-area-inset-bottom));
          }

          /* Hide desktop AppRail on compact layouts */
          .app-rail {
            display: none !important;
          }

          /* Sidebar becomes a fixed left drawer on compact layouts */
          .sidebar-wrapper {
            display: block;
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            width: min(360px, 86vw);
            max-width: 100%;
            z-index: 150;
            transform: translateX(-110%);
            transition: transform 350ms var(--spring-smooth);
          }
          .sidebar-wrapper .sidebar {
            height: 100%;
            width: 100%;
            min-width: 0;
            border-radius: 0 var(--radius-lg) var(--radius-lg) 0 !important;
            box-shadow: var(--shadow-xl) !important;
          }
          .sidebar-wrapper.mobile-open {
            transform: translateX(0);
          }

          /* Backdrop */
          .mobile-sidebar-backdrop {
            display: block;
            position: fixed;
            inset: 0;
            z-index: 149;
            background: rgba(0,0,0,0.4);
            backdrop-filter: blur(var(--glass-blur));
            animation: fade-in 200ms ease;
          }

          /* Main content fills screen */
          .panel-transition-wrapper {
            width: 100%;
            flex: 1 1 auto;
          }

          .editor-panel, .settings-panel, .tags-panel, .import-panel, .stickers-panel {
            width: 100%;
            min-width: 0;
          }

          /* Bottom nav */
          .mobile-bottom-nav {
            display: flex;
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            height: calc(72px + env(safe-area-inset-bottom));
            padding-bottom: env(safe-area-inset-bottom);
            z-index: 100;
            background: var(--color-surface);
            backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
            -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
            border-top: 1px solid var(--color-border);
            box-shadow: 0 -8px 32px rgba(0,0,0,0.15);
            justify-content: space-between;
            padding-inline: max(8px, env(safe-area-inset-left)) max(8px, env(safe-area-inset-right));
          }
          .mobile-nav-btn {
            flex: 1 1 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 3px;
            background: transparent;
            border: none;
            color: var(--color-text-3);
            font-family: var(--font-ui);
            font-size: 10px;
            font-weight: 500;
            cursor: pointer;
            transition: color var(--dur-fast);
            padding: 8px 4px;
            min-height: 44px;
            min-width: 0;
          }
          .mobile-nav-btn.active {
            color: var(--color-accent);
          }
          .mobile-nav-btn:active {
            transform: scale(0.93);
          }
          .mobile-more-backdrop {
            display: block;
            position: fixed;
            inset: 0;
            z-index: 159;
            background: rgba(0,0,0,0.28);
          }
          .mobile-more-sheet {
            position: fixed;
            left: 12px;
            right: 12px;
            bottom: calc(84px + env(safe-area-inset-bottom));
            z-index: 160;
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
            padding: 12px;
            border: 1px solid var(--color-border);
            border-radius: 20px;
            background: var(--color-surface);
            backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
            -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
            box-shadow: var(--shadow-xl);
          }
          .mobile-more-item {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
            padding: 14px 12px;
            border: 1px solid var(--color-border);
            border-radius: 14px;
            background: var(--color-surface-2);
            color: var(--color-text-2);
            font-family: var(--font-ui);
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
          }
          .mobile-more-item.active {
            border-color: var(--color-accent);
            background: var(--color-accent-light);
            color: var(--color-accent);
          }

          @keyframes fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        }

        @media (max-width: 768px) {
          .editor-panel, .settings-panel, .tags-panel, .import-panel, .stickers-panel {
            border-radius: 0 !important;
          }

          .sidebar-wrapper {
            width: min(320px, 88vw);
          }
        }

        @media (max-width: 480px) {
          .mobile-nav-btn span {
            font-size: 9px;
          }
          .mobile-more-sheet {
            grid-template-columns: 1fr;
          }

          .sidebar-wrapper {
            width: min(300px, 92vw);
          }
        }
      `}</style>
    </ToastProvider>
  );
}
