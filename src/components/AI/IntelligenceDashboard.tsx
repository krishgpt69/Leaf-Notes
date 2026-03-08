import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useStore } from '../../lib/store';
import { db } from '../../lib/db';
import { buildStreakRuns, parseLocalDateKey } from '../../lib/streak-utils';

import {
    computeDashboardIntelligence,
    type DashboardIntelligence,
} from '../../lib/intelligence-engine';

function formatDateLabel(date: string) {
    const parsed = parseLocalDateKey(date);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(parsed);
}

function formatDateLabelWithYear(date: string) {
    const parsed = parseLocalDateKey(date);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

function formatFullDateLabel(date: string) {
    const parsed = parseLocalDateKey(date);
    return new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    }).format(parsed);
}

function localDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* ── Heat color palette: cool → warm → hot ── */
const HEAT_COLORS = [
    'rgba(255,255,255,0.04)',         // 0: empty
    'rgba(99, 179, 237, 0.55)',       // 1: cool blue
    'rgba(72, 209, 176, 0.65)',       // 2: teal
    'rgba(246, 194, 62, 0.72)',       // 3: warm amber
    'rgba(237, 137, 54, 0.82)',       // 4: orange
    'rgba(214, 64, 159, 0.92)',       // 5: hot magenta
];

/* ── Sparkline Component ── */
function WeekSparkline({ data }: { data: { count: number }[] }) {
    const max = Math.max(1, ...data.map(d => d.count));
    const h = 28;
    const w = 84;
    const step = w / (data.length - 1 || 1);
    const points = data.map((d, i) => `${i * step},${h - (d.count / max) * (h - 4)}`).join(' ');

    return (
        <svg className="week-sparkline" viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
            <polyline
                points={points}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            {data.map((d, i) => d.count > 0 && (
                <circle
                    key={i}
                    cx={i * step}
                    cy={h - (d.count / max) * (h - 4)}
                    r="2"
                    fill="var(--color-accent)"
                />
            ))}
        </svg>
    );
}

function StreakHistoryModal({
    streaks,
    onClose,
}: {
    streaks: { start: string; end: string; length: number; isCurrent: boolean }[];
    onClose: () => void;
}) {
    const best = streaks.reduce((m, s) => Math.max(m, s.length), 0);
    const current = streaks.find((s) => s.isCurrent)?.length ?? 0;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const content = (
        <div className="streak-modal-backdrop" onClick={onClose} role="presentation">
            <div className="streak-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Streak history">
                <div className="streak-modal-header">
                    <h3>Streak History</h3>
                    <button type="button" className="streak-modal-close" onClick={onClose} aria-label="Close streak history">✕</button>
                </div>
                <div className="streak-modal-stats">
                    <span>Current: <strong>{current}d</strong></span>
                    <span>Best: <strong>{best}d</strong></span>
                    <span>Total runs: <strong>{streaks.length}</strong></span>
                </div>
                <div className="streak-modal-list">
                    {streaks.length === 0 ? (
                        <p className="streak-empty">No streak history yet. Start writing daily to build one.</p>
                    ) : (
                        streaks.map((streak, idx) => (
                            <div key={`${streak.start}-${idx}`} className={`streak-history-row${streak.isCurrent ? ' is-current' : ''}`}>
                                <div className="streak-history-left">
                                    <span className="streak-history-length">{streak.length} day{streak.length === 1 ? '' : 's'}</span>
                                    {streak.isCurrent && <span className="streak-current-badge">Current</span>}
                                </div>
                                <span className="streak-history-range">
                                    {formatDateLabelWithYear(streak.start)} - {formatDateLabelWithYear(streak.end)}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );

    if (typeof document === 'undefined') return content;
    return createPortal(content, document.body);
}

/* ── Day Detail Popover ── */
function DayDetailPopover({
    day,
    weekAvg,
    noteNames,
    anchorRef,
    onClose,
}: {
    day: { date: string; count: number };
    weekAvg: number;
    noteNames: string[];
    anchorRef: React.RefObject<HTMLButtonElement | null>;
    onClose: () => void;
}) {
    const popoverRef = useRef<HTMLDivElement>(null);
    const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({ opacity: 0 });
    const ratio = weekAvg > 0 ? day.count / weekAvg : 0;
    const barPct = Math.min(100, ratio * 50);

    useEffect(() => {
        if (!anchorRef.current || !popoverRef.current) return;

        const updatePosition = () => {
            if (!anchorRef.current || !popoverRef.current) return;
            const anchorRect = anchorRef.current.getBoundingClientRect();
            const popRect = popoverRef.current.getBoundingClientRect();

            const gap = 10;
            const viewportPad = 10;
            const rightSpace = window.innerWidth - anchorRect.right;
            const leftSpace = anchorRect.left;

            // Choose side with enough room, otherwise choose larger available side.
            let left =
                rightSpace >= popRect.width + gap || rightSpace >= leftSpace
                    ? anchorRect.right + gap
                    : anchorRect.left - popRect.width - gap;
            left = Math.max(viewportPad, Math.min(left, window.innerWidth - popRect.width - viewportPad));

            let top = anchorRect.top + anchorRect.height / 2 - popRect.height / 2;

            // Vertical clamping
            if (top < viewportPad) top = viewportPad;
            if (top + popRect.height > window.innerHeight - viewportPad) {
                top = window.innerHeight - popRect.height - viewportPad;
            }

            setPopoverStyle({
                position: 'fixed',
                top,
                left,
                zIndex: 1000,
                opacity: 1
            });
        };

        // Update immediately and on animation frame for accuracy
        updatePosition();
        requestAnimationFrame(updatePosition);

        const resizeObserver = new ResizeObserver(updatePosition);
        resizeObserver.observe(popoverRef.current);

        // Capture scrolls on nested containers, not just window.
        window.addEventListener('scroll', updatePosition, { passive: true, capture: true });
        window.addEventListener('resize', updatePosition, { passive: true });
        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [day, noteNames.length, weekAvg, anchorRef]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (
                popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
                anchorRef.current && !anchorRef.current.contains(e.target as Node)
            ) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose, anchorRef]);

    const popoverContent = (
        <div className="day-popover" ref={popoverRef} style={popoverStyle}>
            <div className="day-popover-header">
                <span className="day-popover-date">{formatFullDateLabel(day.date)}</span>
                <span className="day-popover-count">{day.count} edit{day.count === 1 ? '' : 's'}</span>
            </div>
            <div className="day-popover-comparison">
                <div className="comparison-meta">
                    <span className="comparison-label">vs week avg</span>
                    <span className="comparison-ratio">{ratio > 0 ? `${ratio.toFixed(1)}×` : '—'}</span>
                </div>
                <div className="comparison-bar-track">
                    <div
                        className="comparison-bar-fill"
                        style={{
                            width: `${barPct}%`,
                            background: ratio >= 1.2 ? 'var(--color-accent)' : ratio >= 0.8 ? 'var(--color-teal)' : 'var(--color-amber)',
                        }}
                    />
                    {weekAvg > 0 && <div className="comparison-bar-avg-line" aria-hidden="true" />}
                </div>
            </div>
            {noteNames.length > 0 && (
                <div className="day-popover-notes">
                    <span className="popover-notes-label">Notes edited</span>
                    <ul>
                        {noteNames.slice(0, 5).map((name, i) => (
                            <li key={i}>{name}</li>
                        ))}
                        {noteNames.length > 5 && <li className="more-notes">+{noteNames.length - 5} more</li>}
                    </ul>
                </div>
            )}
        </div>
    );

    if (typeof document === 'undefined') return popoverContent;
    return createPortal(popoverContent, document.body);
}


function IntelligenceDashboardInner() {
    const notes = useStore(s => s.notes);
    const streak = useStore(s => s.streak);
    const todayActive = useStore(s => s.todayActive);

    const [intel, setIntel] = useState<DashboardIntelligence | null>(null);
    const [selectedHeatmapDate, setSelectedHeatmapDate] = useState<{ date: string; count: number } | null>(null);
    const heatmapRange = 24;
    const [selectedWeekIndex, setSelectedWeekIndex] = useState<number | null>(null);
    const [popoverNotes, setPopoverNotes] = useState<string[]>([]);
    const [showStreakHistory, setShowStreakHistory] = useState(false);
    const selectedCellRef = useRef<HTMLButtonElement | null>(null);

    const todayStr = useMemo(() => localDateKey(new Date()), []);
    const monthFormatter = useMemo(
        () => new Intl.DateTimeFormat('en-US', { month: 'short' }),
        []
    );

    const activeNotes = useMemo(() => notes.filter(n => !n.trashed), [notes]);
    const notesRevision = useMemo(
        () => activeNotes.reduce((sum, note) => sum + new Date(note.updatedAt).getTime() + (note.wordCount || 0), activeNotes.length),
        [activeNotes]
    );

    const activityRecords = useLiveQuery(() => db.activity.toArray(), [notesRevision]);
    const activityData = useMemo(() => {
        const data: Record<string, number> = {};
        for (const record of activityRecords || []) data[record.date] = record.notesEdited;
        return data;
    }, [activityRecords]);
    const activityRevision = useMemo(
        () => (activityRecords || []).reduce((sum, item) => sum + item.notesEdited + item.date.length, 0),
        [activityRecords]
    );

    useEffect(() => {
        let mounted = true;
        const timer = setTimeout(() => {
            computeDashboardIntelligence(activeNotes, [])
                .then(result => { if (mounted) setIntel(result); })
                .catch(() => { });
        }, 300);
        return () => { mounted = false; clearTimeout(timer); };
    }, [notesRevision, activityRevision, activeNotes]);

    const heatmapWeeks = useMemo(() => {
        const weeks: { date: string; count: number; monthShort: string }[][] = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Anchor grid to true calendar weeks: Sun -> Sat.
        const currentWeekStart = new Date(today);
        currentWeekStart.setDate(today.getDate() - today.getDay());

        for (let w = heatmapRange - 1; w >= 0; w--) {
            const weekStart = new Date(currentWeekStart);
            weekStart.setDate(currentWeekStart.getDate() - w * 7);
            const week: { date: string; count: number; monthShort: string }[] = [];
            for (let d = 0; d < 7; d++) {
                const date = new Date(weekStart);
                date.setDate(weekStart.getDate() + d);
                const dateStr = localDateKey(date);
                week.push({
                    date: dateStr,
                    // Keep future days in the current week visually empty.
                    count: date <= today ? (activityData[dateStr] || 0) : 0,
                    monthShort: monthFormatter.format(date),
                });
            }
            weeks.push(week);
        }
        return weeks;
    }, [activityData, heatmapRange, monthFormatter]);

    const maxDailyEdits = useMemo(
        () => heatmapWeeks.flat().reduce((max, day) => Math.max(max, day.count), 0),
        [heatmapWeeks]
    );

    /* ── Multi-color heat function ── */
    const heatColor = useCallback((count: number) => {
        if (count === 0) return HEAT_COLORS[0];

        const normalized = Math.sqrt(count / Math.max(1, maxDailyEdits));
        // Map to 1-5 range
        const level = Math.min(5, Math.max(1, Math.ceil(normalized * 5)));
        return HEAT_COLORS[level];
    }, [maxDailyEdits]);

    /* ── Glow intensity class ── */
    const glowClass = useCallback((count: number) => {
        if (count === 0) return '';
        const normalized = Math.sqrt(count / Math.max(1, maxDailyEdits));
        if (normalized > 0.8) return 'ember-glow-high';
        if (normalized > 0.4) return 'ember-glow-mid';
        return 'ember-glow-low';
    }, [maxDailyEdits]);

    const monthMarkers = useMemo(() => {
        if (heatmapWeeks.length === 0) return [];

        return heatmapWeeks.map((week, i) => {
            if (i === 0) return week[0]?.monthShort || '';
            const monthStartDay = week.find((day) => parseLocalDateKey(day.date).getDate() === 1);
            return monthStartDay?.monthShort || '';
        });
    }, [heatmapWeeks]);

    const streakHistory = useMemo(() => {
        const activityList = Object.entries(activityData).map(([date, notesEdited]) => ({ date, notesEdited }));
        return buildStreakRuns(activityList, streak, todayActive, todayStr);
    }, [activityData, streak, todayActive, todayStr]);

    /* ── Month boundary detection ── */
    const monthBoundaries = useMemo(() => {
        const boundaries = new Set<number>();
        for (let i = 1; i < heatmapWeeks.length; i++) {
            const hasMonthStart = heatmapWeeks[i].some((day) => parseLocalDateKey(day.date).getDate() === 1);
            if (hasMonthStart) {
                boundaries.add(i);
            }
        }
        return boundaries;
    }, [heatmapWeeks]);

    const selectedWeek = useMemo(() => {
        if (heatmapWeeks.length === 0) return null;
        const fallback = heatmapWeeks.length - 1;
        const idx = selectedWeekIndex == null ? fallback : Math.max(0, Math.min(selectedWeekIndex, heatmapWeeks.length - 1));
        return { index: idx, data: heatmapWeeks[idx] };
    }, [heatmapWeeks, selectedWeekIndex]);

    const weekSummary = useMemo(() => {
        if (!selectedWeek?.data) return null;
        const total = selectedWeek.data.reduce((sum, day) => sum + day.count, 0);
        const activeDays = selectedWeek.data.filter(day => day.count > 0).length;
        const bestDay = selectedWeek.data.reduce((best, day) => (day.count > best.count ? day : best), selectedWeek.data[0]);
        const avg = total / 7;
        return { total, activeDays, bestDay, avg };
    }, [selectedWeek]);

    const recentWindowDays = 28;
    const recentWindow = useMemo(() => {
        const days: { date: string; count: number }[] = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        for (let i = recentWindowDays - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateStr = localDateKey(date);
            days.push({ date: dateStr, count: activityData[dateStr] || 0 });
        }
        return days;
    }, [activityData]);

    const recentStats = useMemo(() => {
        const total = recentWindow.reduce((sum, day) => sum + day.count, 0);
        const activeDays = recentWindow.filter(day => day.count > 0).length;
        const avg = total / recentWindowDays;
        const bestDay = recentWindow.reduce(
            (best, day) => (day.count > best.count ? day : best),
            recentWindow[0] || { date: todayStr, count: 0 }
        );
        const dowTotals = new Array(7).fill(0);
        for (const day of recentWindow) {
            const idx = parseLocalDateKey(day.date).getDay();
            dowTotals[idx] += day.count;
        }
        const bestDowIdx = dowTotals.indexOf(Math.max(...dowTotals));
        const consistencyPct = Math.round((activeDays / recentWindowDays) * 100);
        return { total, activeDays, avg, bestDay, bestDowIdx, consistencyPct };
    }, [recentWindow, todayStr]);

    /* ── Streak detection within week ── */
    const streakSegments = useMemo(() => {
        if (!selectedWeek?.data) return [];
        const segments: { start: number; length: number }[] = [];
        let streakStart = -1;
        let streakLen = 0;
        for (let i = 0; i < selectedWeek.data.length; i++) {
            if (selectedWeek.data[i].count > 0) {
                if (streakStart === -1) streakStart = i;
                streakLen++;
            } else {
                if (streakLen >= 2) segments.push({ start: streakStart, length: streakLen });
                streakStart = -1;
                streakLen = 0;
            }
        }
        if (streakLen >= 2) segments.push({ start: streakStart, length: streakLen });
        return segments;
    }, [selectedWeek]);

    /* ── Fetch note names for selected day ── */
    const loadDayNoteNames = useCallback(async (dateStr: string) => {
        try {
            const [year, month, day] = dateStr.split('-').map(Number);
            const dayStart = new Date(year, month - 1, day).getTime();
            const dayEnd = dayStart + 86400000;
            const activities = await db.noteActivity
                .where('timestamp')
                .between(dayStart, dayEnd)
                .toArray();
            const noteIds = [...new Set(activities.map(a => a.noteId))];
            const noteRecords = await db.notes.where('id').anyOf(noteIds).toArray();
            setPopoverNotes(noteRecords.map(n => n.title || 'Untitled'));
        } catch {
            setPopoverNotes([]);
        }
    }, []);

    const handleDayClick = useCallback((day: { date: string; count: number }, wi: number, cellRef: HTMLButtonElement | null) => {
        setSelectedHeatmapDate({ date: day.date, count: day.count });
        setSelectedWeekIndex(wi);
        selectedCellRef.current = cellRef;
        loadDayNoteNames(day.date);
    }, [loadDayNoteNames]);

    const closePopover = useCallback(() => {
        setSelectedHeatmapDate(null);
        setPopoverNotes([]);
    }, []);

    const w = intel?.writing;
    const s = intel?.streak;
    const p = intel?.patterns;
    const displayedStreak = s?.current ?? streak;

    const dateStr = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
    const deepInsightLines = useMemo(() => {
        const lines: string[] = [];
        if (recentStats.activeDays === 0) {
            lines.push('Write consistently for a few days to generate deep productivity pattern analysis.');
            return lines;
        }

        const avgLabel = recentStats.avg >= 10 ? Math.round(recentStats.avg).toString() : recentStats.avg.toFixed(1).replace(/\.0$/, '');
        lines.push(
            `In the last 4 weeks, you wrote on ${recentStats.activeDays} of ${recentWindowDays} days ` +
            `(${recentStats.consistencyPct}% consistency), averaging ${avgLabel} edits per day.`
        );

        if (p && p.peakWindow !== '—') {
            lines.push(`Your strongest 2-hour window is ${p.peakWindow}, and ${p.peakDay}s tend to be your most productive.`);
        } else if (recentStats.bestDay.count > 0) {
            lines.push(`Your most active day was ${formatDateLabel(recentStats.bestDay.date)} (${recentStats.bestDay.count} edits).`);
        }

        return lines;
    }, [recentStats, p]);

    const insightChips = useMemo(() => {
        const chips: { label: string; value: string; tone: 'good' | 'warn' | 'neutral' }[] = [];

        if (recentStats.activeDays === 0) {
            chips.push({ label: 'Consistency', value: 'Learning', tone: 'neutral' });
        } else {
            const tone = recentStats.consistencyPct >= 60 ? 'good' : recentStats.consistencyPct >= 35 ? 'neutral' : 'warn';
            chips.push({ label: 'Consistency', value: `${recentStats.consistencyPct}%`, tone });
        }

        if (w) {
            if (w.weeklyTrend >= 15) {
                chips.push({ label: 'Momentum', value: `Up ${w.weeklyTrend}%`, tone: 'good' });
            } else if (w.weeklyTrend <= -15) {
                chips.push({ label: 'Momentum', value: `Down ${Math.abs(w.weeklyTrend)}%`, tone: 'warn' });
            } else if (w.weeklyTrend !== 0) {
                chips.push({ label: 'Momentum', value: `${w.weeklyTrend > 0 ? 'Up' : 'Down'} ${Math.abs(w.weeklyTrend)}%`, tone: 'neutral' });
            } else {
                chips.push({ label: 'Momentum', value: 'Flat', tone: 'neutral' });
            }
        } else {
            chips.push({ label: 'Momentum', value: '—', tone: 'neutral' });
        }

        if (p && p.peakWindow !== '—') {
            chips.push({ label: 'Focus Window', value: p.peakWindow, tone: 'good' });
        } else {
            const label = recentStats.activeDays > 0 ? `${SHORT_DAYS[recentStats.bestDowIdx]} Focus` : 'Building';
            chips.push({ label: 'Focus Window', value: label, tone: 'neutral' });
        }

        return chips;
    }, [recentStats, p, w]);

    return (
        <div className="intelligence-dashboard premium-layout">
            <div className="intel-premium-header">
                <h1 className="intel-premium-title">Leaf Intelligence</h1>
                <p className="intel-premium-subtitle">
                    Your writing cadence, analyzed. <span className="intel-date">{dateStr}</span>
                </p>
            </div>

            <div className="intel-metrics-row">
                <button
                    type="button"
                    className="intel-metric-card streak-card"
                    style={{ animationDelay: '100ms' }}
                    onClick={() => setShowStreakHistory(true)}
                >
                    <div className="metric-header">CURRENT STREAK</div>
                    <div className="metric-value">
                        <span className="number">{displayedStreak}</span> <span className="unit">days</span>
                        {displayedStreak >= 3 && <span className="streak-flame" title={`${displayedStreak}-day streak!`}>🔥</span>}
                    </div>
                    <div className="metric-insight italic">
                        {s && s.longest > 0 ? `Best: ${s.longest}d.` : ''} {s?.insight || 'Keep going.'}
                    </div>
                    <span className="streak-history-hint">View streak history</span>
                </button>

                <div className="intel-metric-card" style={{ animationDelay: '150ms' }}>
                    <div className="metric-header">TOTAL ENTRIES</div>
                    <div className="metric-value">
                        <span className="number">{w?.totalNotes ?? activeNotes.length}</span> <span className="unit">notes</span>
                    </div>
                    <div className="metric-chart">
                        {heatmapWeeks.slice(-1)[0]?.map((day, i) => (
                            <div key={i} className="mini-bar" style={{ height: `${Math.max(10, Math.min(100, day.count * 20))}%`, opacity: day.count > 0 ? 1 : 0.3, transition: `height 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 40 + 300}ms` }} />
                        ))}
                    </div>
                </div>

                <div className="intel-metric-card" style={{ animationDelay: '200ms' }}>
                    <div className="metric-header">VOLUME</div>
                    <div className="metric-value">
                        <span className="number">{w ? (w.totalWords >= 1000 ? (w.totalWords / 1000).toFixed(1) + 'k' : w.totalWords.toString()) : '0'}</span> <span className="unit">words</span>
                    </div>
                    {w && (
                        <div className="metric-trend">
                            <span className={w.weeklyTrend >= 0 ? 'trend-up' : 'trend-down'}>
                                {w.weeklyTrend >= 0 ? '↑' : '↓'} {Math.abs(w.weeklyTrend)}%
                            </span> vs last week
                        </div>
                    )}
                </div>

            </div>

            <div className="intel-main-layout">
                <div className="intel-col intel-heatmap-col intel-heatmap-only">
                    <div className="heatmap-header">
                        <h2 className="intel-col-title">Activity Heatmap</h2>
                    </div>

                    {/* Heat legend */}
                    <div className="heat-legend">
                        <span>Less</span>
                        {HEAT_COLORS.map((color, i) => (
                            <div key={i} className="heat-legend-dot" style={{ background: color }} />
                        ))}
                        <span>More</span>
                    </div>

                    <div className="intel-heatmap premium-heatmap">
                        <div className="heatmap-shell">
                            <div className="heatmap-month-axis">
                                {monthMarkers.map((label, index) => (
                                    <span key={`${label}-${index}`} className="month-label">{label}</span>
                                ))}
                            </div>
                            <div className="heatmap-body">
                                <div className="heatmap-weekday-axis">
                                    <span>Sun</span>
                                    <span>Tue</span>
                                    <span>Thu</span>
                                    <span>Sat</span>
                                </div>
                                <div className="heatmap-grid premium-grid">
                                    {heatmapWeeks.map((week, wi) => (
                                        <div
                                            key={wi}
                                            className={
                                                `heatmap-col` +
                                                (selectedWeek?.index === wi ? ' selected-week' : '') +
                                                (monthBoundaries.has(wi) ? ' month-boundary' : '')
                                            }
                                            style={{ animationDelay: `${wi * 30 + 300}ms` }}
                                            onClick={() => setSelectedWeekIndex(wi)}
                                        >
                                            {week.map((day, di) => {
                                                const isToday = day.date === todayStr;
                                                const isSelected = selectedHeatmapDate?.date === day.date;
                                                return (
                                                    <button
                                                        type="button"
                                                        key={`${day.date}-${di}`}
                                                        className={
                                                            `heatmap-cell round-cell` +
                                                            (isSelected ? ' selected-day' : '') +
                                                            (isToday ? ' today-marker' : '') +
                                                            (day.count > 0 ? ` ${glowClass(day.count)}` : '')
                                                        }
                                                        aria-label={`${formatFullDateLabel(day.date)}: ${day.count} edit${day.count === 1 ? '' : 's'}`}
                                                        title={`${formatFullDateLabel(day.date)}: ${day.count} edit${day.count === 1 ? '' : 's'}`}
                                                        style={{ background: heatColor(day.count) }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDayClick(day, wi, e.currentTarget);
                                                        }}
                                                    />
                                                );
                                            })}
                                            {/* Streak connector lines within the selected week */}
                                            {selectedWeek?.index === wi && streakSegments.map((seg, si) => (
                                                <div
                                                    key={`streak-${si}`}
                                                    className="streak-connector"
                                                    style={{
                                                        top: `${seg.start * 20 + 7}px`,
                                                        height: `${(seg.length - 1) * 20}px`,
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Day detail popover */}
                    {selectedHeatmapDate && (
                        <DayDetailPopover
                            day={selectedHeatmapDate}
                            weekAvg={weekSummary?.avg || 0}
                            noteNames={popoverNotes}
                            anchorRef={selectedCellRef}
                            onClose={closePopover}
                        />
                    )}

                    {weekSummary && selectedWeek && (
                        <div className="heatmap-week-summary">
                            <div className="week-summary-top">
                                <div className="week-summary-text">
                                    <p>
                                        Week of {formatDateLabel(selectedWeek.data[0].date)}: <strong>{weekSummary.total}</strong> edits
                                        across <strong>{weekSummary.activeDays}</strong> active day{weekSummary.activeDays === 1 ? '' : 's'}.
                                    </p>
                                    <p>
                                        Peak day: {formatDateLabel(weekSummary.bestDay.date)} ({weekSummary.bestDay.count} edits)
                                    </p>
                                </div>
                                <WeekSparkline data={selectedWeek.data} />
                            </div>
                        </div>
                    )}

                    <h3 className="deep-insights-title">Deep Insights</h3>
                    <div className="deep-insights-text">
                        {deepInsightLines.map((line, i) => (
                            <p key={`${line}-${i}`}>{line}</p>
                        ))}
                    </div>
                    <div className="deep-insights-chips">
                        {insightChips.map((chip) => (
                            <span key={chip.label} className={`insight-chip insight-chip--${chip.tone}`}>
                                <span className="chip-label">{chip.label}</span>
                                <span className="chip-value">{chip.value}</span>
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            <div className="intel-privacy-footer">
                Insights computed locally — your notes never leave your device.
            </div>

            {showStreakHistory && (
                <StreakHistoryModal
                    streaks={streakHistory}
                    onClose={() => setShowStreakHistory(false)}
                />
            )}
        </div>
    );
}

export default memo(IntelligenceDashboardInner);
