/* ═══════════════════════════════════════════════════════════════
   🧠 Intelligence Engine — Pure computation, no UI
   Reads from DB, produces insights, trends, and predictions.
   All functions are wrapped in try-catch for reliability.
   ═══════════════════════════════════════════════════════════════ */

import { db, type Note, type NoteActivity } from './db';

// ─── Types ──────────────────────────────────────────────────

export interface StreakIntelligence {
    current: number;
    longest: number;
    averageLength: number;
    usualBreakDay: string | null;
    prediction: string | null;
    trend: 'improving' | 'declining' | 'stable';
    insight: string;
}

export interface WritingIntelligence {
    totalNotes: number;
    totalWords: number;
    todayNotes: number;
    todayWords: number;
    dailyAvgNotes: number;
    dailyAvgWords: number;
    todayVsAvg: number;
    weeklyTrend: number;
    monthlyTrend: number;
    qualityScore: number;
    topTopics: { tag: string; count: number }[];
    stalledNotes: { title: string; daysSince: number; id: string }[];
    bestDay: string | null;
    bestHour: number | null;
    projectedMonthlyWords: number;
}

export interface ProductivityPattern {
    dayScores: number[];
    hourScores: number[];
    peakDay: string;
    peakHour: string;
    lowDay: string;
    lowHour: string;
    peakWindow: string;
}

export interface TaskIntelligence {
    total: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    oldestDays: number;
    avgAgeDays: number;
    atRiskCount: number;
}

export interface TodayInsight {
    icon: string;
    text: string;
    type: 'positive' | 'neutral' | 'warning';
    cta?: {
        label: string;
        action: 'scroll_to_actions' | 'view_stalled' | 'improve_quality' | 'write_now' | 'view_note';
        payload?: string;
    };
}

export interface DashboardIntelligence {
    streak: StreakIntelligence;
    writing: WritingIntelligence;
    patterns: ProductivityPattern;
    tasks: TaskIntelligence;
    insights: TodayInsight[];
    computedAt: number;
}

// ─── Constants ──────────────────────────────────────────────

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Safe math helpers ──────────────────────────────────────

/** Safe max — returns 0 if array is empty */
function safeMax(arr: number[]): number {
    if (arr.length === 0) return 0;
    let m = arr[0];
    for (let i = 1; i < arr.length; i++) if (arr[i] > m) m = arr[i];
    return m;
}

/** Safe division — returns 0 if divisor is 0 */
function safeDiv(a: number, b: number): number {
    if (b === 0 || !isFinite(b)) return 0;
    const r = a / b;
    return isFinite(r) ? r : 0;
}

/** Safe percentage change — returns 0 if base is 0 */
function safePctChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
}

/** Local date string YYYY-MM-DD (avoids UTC timezone issues) */
function localDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD as local date (not UTC) */
function parseLocalDate(s: string): Date {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
}

// ─── Cache ──────────────────────────────────────────────────

let cachedResult: DashboardIntelligence | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

// ─── Defaults ───────────────────────────────────────────────

const DEFAULT_STREAK: StreakIntelligence = {
    current: 0, longest: 0, averageLength: 0,
    usualBreakDay: null, prediction: null, trend: 'stable',
    insight: 'Start writing to build your streak!',
};

const DEFAULT_WRITING: WritingIntelligence = {
    totalNotes: 0, totalWords: 0, todayNotes: 0, todayWords: 0,
    dailyAvgNotes: 0, dailyAvgWords: 0, todayVsAvg: 0,
    weeklyTrend: 0, monthlyTrend: 0, qualityScore: 0,
    topTopics: [], stalledNotes: [], bestDay: null, bestHour: null,
    projectedMonthlyWords: 0,
};

const DEFAULT_PATTERNS: ProductivityPattern = {
    dayScores: [0, 0, 0, 0, 0, 0, 0],
    hourScores: new Array(24).fill(0),
    peakDay: '—', peakHour: '—', lowDay: '—', lowHour: '—', peakWindow: '—',
};

const DEFAULT_TASKS: TaskIntelligence = {
    total: 0, highCount: 0, mediumCount: 0, lowCount: 0,
    oldestDays: 0, avgAgeDays: 0, atRiskCount: 0,
};

// ─── Main Computation ───────────────────────────────────────

export async function computeDashboardIntelligence(
    notes: Note[],
    actionItems: { urgency: string; text: string; noteId: string; createdAt?: number }[]
): Promise<DashboardIntelligence> {
    const now = Date.now();

    // Return cached if fresh
    if (cachedResult && now - cacheTime < CACHE_TTL) {
        return cachedResult;
    }

    try {
        const activeNotes = notes.filter(n => !n.trashed);

        // Load all activity data in parallel
        const [allActivity, dailyActivity] = await Promise.all([
            db.noteActivity.orderBy('timestamp').toArray().catch(() => [] as NoteActivity[]),
            db.activity.orderBy('date').toArray().catch(() => [] as { date: string; notesEdited: number }[]),
        ]);

        // Each sub-computation is individually wrapped in try-catch
        let streak: StreakIntelligence;
        try { streak = computeStreakIntelligence(dailyActivity); }
        catch { streak = DEFAULT_STREAK; }

        let writing: WritingIntelligence;
        try { writing = computeWritingIntelligence(activeNotes, allActivity, dailyActivity); }
        catch { writing = { ...DEFAULT_WRITING, totalNotes: activeNotes.length, totalWords: activeNotes.reduce((s, n) => s + (n.wordCount || 0), 0) }; }

        let patterns: ProductivityPattern;
        try { patterns = computeProductivityPatterns(allActivity); }
        catch { patterns = DEFAULT_PATTERNS; }

        let tasks: TaskIntelligence;
        try { tasks = computeTaskIntelligence(actionItems); }
        catch { tasks = { ...DEFAULT_TASKS, total: actionItems.length }; }

        let insights: TodayInsight[];
        try { insights = computeTodayInsights(writing, streak, patterns, tasks); }
        catch { insights = []; }

        cachedResult = { streak, writing, patterns, tasks, insights, computedAt: now };
        cacheTime = now;
        return cachedResult;
    } catch {
        // Absolute worst case: return safe defaults
        return {
            streak: DEFAULT_STREAK,
            writing: DEFAULT_WRITING,
            patterns: DEFAULT_PATTERNS,
            tasks: DEFAULT_TASKS,
            insights: [],
            computedAt: now,
        };
    }
}

/** Force recompute on next call */
export function invalidateIntelligenceCache() {
    cachedResult = null;
    cacheTime = 0;
}

// ─── Streak Intelligence ────────────────────────────────────

function computeStreakIntelligence(
    dailyActivity: { date: string; notesEdited: number }[]
): StreakIntelligence {
    if (dailyActivity.length === 0) return DEFAULT_STREAK;

    // Build set of active dates using LOCAL date strings
    const activeDates = new Set<string>();
    for (const d of dailyActivity) {
        // DB stores dates as YYYY-MM-DD already — trust them
        if (d.date && d.notesEdited > 0) activeDates.add(d.date);
    }

    if (activeDates.size === 0) return DEFAULT_STREAK;

    const sortedDates = [...activeDates].sort();

    // Find current streak using local dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = localDateStr(today);

    let current = 0;
    const checkDate = new Date(today);

    if (activeDates.has(todayStr)) {
        current = 1;
    } else {
        // Check yesterday
        checkDate.setDate(checkDate.getDate() - 1);
        const yesterdayStr = localDateStr(checkDate);
        if (!activeDates.has(yesterdayStr)) {
            current = 0;
        } else {
            current = 1;
        }
    }

    // Count backwards from the starting point
    if (current > 0) {
        const startDate = activeDates.has(todayStr) ? new Date(today) : new Date(checkDate);
        const countDate = new Date(startDate);
        for (let i = 1; i < 365; i++) {
            countDate.setDate(countDate.getDate() - 1);
            if (activeDates.has(localDateStr(countDate))) {
                current++;
            } else {
                break;
            }
        }
    }

    // Find all historical streaks for pattern analysis
    const streaks: { length: number; endDay: number }[] = [];
    let streakLen = 1;

    for (let i = 1; i < sortedDates.length; i++) {
        const prev = parseLocalDate(sortedDates[i - 1]);
        const curr = parseLocalDate(sortedDates[i]);
        const diffDays = Math.round((curr.getTime() - prev.getTime()) / DAY_MS);

        if (diffDays === 1) {
            streakLen++;
        } else {
            // Streak broke — record when it broke
            const breakDate = new Date(prev);
            breakDate.setDate(breakDate.getDate() + 1);
            streaks.push({ length: streakLen, endDay: breakDate.getDay() });
            streakLen = 1;
        }
    }
    // Push final streak (endDay = -1 because it hasn't ended yet or is the last one)
    streaks.push({ length: streakLen, endDay: -1 });

    const longest = Math.max(safeMax(streaks.map(s => s.length)), current);
    const totalStreakLength = streaks.reduce((s, st) => s + st.length, 0);
    const averageLength = streaks.length > 0
        ? Math.round(safeDiv(totalStreakLength, streaks.length) * 10) / 10
        : 0;

    // Find most common break day (only from streaks that actually broke)
    const breakDayCounts = [0, 0, 0, 0, 0, 0, 0];
    for (const s of streaks) {
        if (s.endDay >= 0 && s.endDay <= 6) {
            breakDayCounts[s.endDay]++;
        }
    }
    const maxBreakCount = safeMax(breakDayCounts);
    // Only show break day if we have at least 2 data points to be meaningful
    const usualBreakDay = maxBreakCount >= 2 ? DAYS[breakDayCounts.indexOf(maxBreakCount)] : null;

    // Trend: compare recent streaks to older ones (only if enough data)
    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (streaks.length >= 4) {
        const half = Math.floor(streaks.length / 2);
        const recentStreaks = streaks.slice(half);
        const olderStreaks = streaks.slice(0, half);
        const recentAvg = safeDiv(recentStreaks.reduce((s, st) => s + st.length, 0), recentStreaks.length);
        const olderAvg = safeDiv(olderStreaks.reduce((s, st) => s + st.length, 0), olderStreaks.length);

        if (olderAvg > 0) {
            const ratio = safeDiv(recentAvg, olderAvg);
            trend = ratio > 1.2 ? 'improving' : ratio < 0.8 ? 'declining' : 'stable';
        }
    }

    // Prediction for 30-day streak milestone
    let prediction: string | null = null;
    if (current > 0 && current < 30) {
        const daysNeeded = 30 - current;
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + daysNeeded);
        prediction = `At this pace, 30-day streak by ${targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    } else if (current >= 30) {
        prediction = `Amazing! ${current}-day streak and counting!`;
    }

    // Contextual insight text
    let insight: string;
    if (current === 0) {
        insight = 'Start writing today to begin a new streak!';
    } else if (trend === 'improving' && streaks.length >= 4) {
        const half = Math.floor(streaks.length / 2);
        const recentAvg = safeDiv(streaks.slice(half).reduce((s, st) => s + st.length, 0), streaks.length - half);
        const olderAvg = safeDiv(streaks.slice(0, half).reduce((s, st) => s + st.length, 0), half);
        const pct = olderAvg > 0 ? Math.round((safeDiv(recentAvg, olderAvg) - 1) * 100) : 0;
        insight = pct > 0
            ? `Your streaks are getting longer — ${pct}% more consistent!`
            : `Consistent at ~${Math.round(averageLength)} days per streak. Push for a new record!`;
    } else if (trend === 'declining') {
        insight = 'Your recent streaks are shorter. Try setting daily reminders.';
    } else if (current === longest && current > 1) {
        insight = `You're at your all-time best! Keep the ${current}-day streak going!`;
    } else {
        insight = `Consistent at ~${Math.round(averageLength)} days per streak. Push for a new record!`;
    }

    return { current, longest, averageLength, usualBreakDay, prediction, trend, insight };
}

// ─── Writing Intelligence ───────────────────────────────────

function computeWritingIntelligence(
    notes: Note[],
    activities: NoteActivity[],
    dailyActivity: { date: string; notesEdited: number }[]
): WritingIntelligence {
    if (notes.length === 0) return DEFAULT_WRITING;

    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    const totalNotes = notes.length;
    const totalWords = notes.reduce((s, n) => s + (n.wordCount || 0), 0);

    // Today: count notes edited today
    const todayNotes = notes.filter(n => new Date(n.updatedAt).getTime() >= todayMs).length;

    // Today's words: sum of positive wordDeltas from today's edit activities
    const todayWords = activities
        .filter(a => a.timestamp >= todayMs && a.action === 'edit' && a.wordDelta != null && a.wordDelta > 0)
        .reduce((s, a) => s + (a.wordDelta || 0), 0);

    // Daily averages from activity records
    // Count only active days, and calculate span properly
    const activeDays = dailyActivity.filter(d => d.notesEdited > 0);
    const totalEditsOverTime = activeDays.reduce((s, d) => s + d.notesEdited, 0);

    // Span = days between first and last activity, at least 1
    let spanDays = 1;
    if (dailyActivity.length >= 2) {
        const first = parseLocalDate(dailyActivity[0].date);
        const last = parseLocalDate(dailyActivity[dailyActivity.length - 1].date);
        spanDays = Math.max(1, Math.round((last.getTime() - first.getTime()) / DAY_MS) + 1);
    } else if (dailyActivity.length === 1) {
        spanDays = 1;
    }

    const dailyAvgNotes = Math.round(safeDiv(totalEditsOverTime, spanDays) * 10) / 10;

    // Word-based daily average from edit activities
    const editActivities = activities.filter(a => a.action === 'edit' && a.wordDelta != null && a.wordDelta > 0);
    const totalWordsWritten = editActivities.reduce((s, a) => s + (a.wordDelta || 0), 0);
    const activitySpanDays = activities.length > 1
        ? Math.max(1, Math.ceil((activities[activities.length - 1].timestamp - activities[0].timestamp) / DAY_MS) + 1)
        : 1;
    const dailyAvgWords = Math.round(safeDiv(totalWordsWritten, activitySpanDays));

    // Today vs avg (only meaningful if we have enough history)
    const todayVsAvg = dailyAvgNotes > 0 && spanDays >= 3
        ? Math.round(safeDiv(todayNotes, dailyAvgNotes) * 10) / 10
        : 0;

    // Weekly trend: count edits from dailyActivity, not notes
    const thisWeekStart = now - WEEK_MS;
    const lastWeekStart = now - 2 * WEEK_MS;

    let thisWeekEdits = 0;
    let lastWeekEdits = 0;
    for (const d of dailyActivity) {
        const dt = parseLocalDate(d.date).getTime();
        if (dt >= thisWeekStart) thisWeekEdits += d.notesEdited;
        else if (dt >= lastWeekStart) lastWeekEdits += d.notesEdited;
    }
    const weeklyTrend = safePctChange(thisWeekEdits, lastWeekEdits);

    // Monthly trend: same approach
    const thisMonthStart = now - 30 * DAY_MS;
    const lastMonthStart = now - 60 * DAY_MS;

    let thisMonthEdits = 0;
    let lastMonthEdits = 0;
    for (const d of dailyActivity) {
        const dt = parseLocalDate(d.date).getTime();
        if (dt >= thisMonthStart) thisMonthEdits += d.notesEdited;
        else if (dt >= lastMonthStart) lastMonthEdits += d.notesEdited;
    }
    const monthlyTrend = safePctChange(thisMonthEdits, lastMonthEdits);

    // Quality score
    const qualityScore = computeQualityScore(notes);

    // Top topics
    const tagCount: Record<string, number> = {};
    for (const n of notes) {
        if (Array.isArray(n.tags)) {
            for (const t of n.tags) {
                if (t && typeof t === 'string') {
                    tagCount[t] = (tagCount[t] || 0) + 1;
                }
            }
        }
    }
    const topTopics = Object.entries(tagCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag, count]) => ({ tag, count }));

    // Stalled notes (not edited in 14+ days, >100 words, not in trash)
    const stalledNotes = notes
        .filter(n => new Date(n.updatedAt).getTime() < now - 14 * DAY_MS && (n.wordCount || 0) > 100)
        .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
        .slice(0, 3)
        .map(n => ({
            title: n.title || 'Untitled',
            daysSince: Math.floor((now - new Date(n.updatedAt).getTime()) / DAY_MS),
            id: n.id,
        }));

    // Best day / hour from edit activity
    const dayBuckets = [0, 0, 0, 0, 0, 0, 0];
    const hourBuckets = new Array(24).fill(0) as number[];
    let hasEditData = false;
    for (const a of activities) {
        if (a.action === 'edit') {
            hasEditData = true;
            const d = new Date(a.timestamp);
            const weight = Math.max(1, Math.abs(a.wordDelta || 1));
            dayBuckets[d.getDay()] += weight;
            hourBuckets[d.getHours()] += weight;
        }
    }

    let bestDay: string | null = null;
    let bestHour: number | null = null;
    if (hasEditData) {
        const maxDayVal = safeMax(dayBuckets);
        const maxHourVal = safeMax(hourBuckets);
        if (maxDayVal > 0) bestDay = DAYS[dayBuckets.indexOf(maxDayVal)];
        if (maxHourVal > 0) bestHour = hourBuckets.indexOf(maxHourVal);
    }

    // Projected monthly words: based on words written this month (from edit activities)
    const nowDate = new Date();
    const dayOfMonth = nowDate.getDate();
    const daysInMonth = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 0).getDate();
    const monthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime();

    // Sum positive word deltas this month
    let wordsThisMonth = 0;
    for (const a of activities) {
        if (a.action === 'edit' && a.timestamp >= monthStart && a.wordDelta != null && a.wordDelta > 0) {
            wordsThisMonth += a.wordDelta;
        }
    }

    // If no edit activities this month, fall back to a reasonable estimate from note word counts
    if (wordsThisMonth === 0 && todayNotes > 0) {
        wordsThisMonth = notes
            .filter(n => new Date(n.updatedAt).getTime() >= monthStart)
            .reduce((s, n) => s + (n.wordCount || 0), 0);
    }

    const projectedMonthlyWords = dayOfMonth >= 1
        ? Math.round(safeDiv(wordsThisMonth, dayOfMonth) * daysInMonth)
        : 0;

    return {
        totalNotes, totalWords, todayNotes, todayWords,
        dailyAvgNotes, dailyAvgWords, todayVsAvg,
        weeklyTrend, monthlyTrend, qualityScore,
        topTopics, stalledNotes, bestDay, bestHour,
        projectedMonthlyWords,
    };
}

// ─── Quality Score ──────────────────────────────────────────

function computeQualityScore(notes: Note[]): number {
    if (notes.length === 0) return 0;

    // Sample last 20 recently modified notes
    const sample = [...notes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 20);
    let total = 0;

    for (const n of sample) {
        let score = 0;

        // Completeness (25 pts): has title, content, tags
        if (n.title && n.title !== 'Untitled' && n.title.trim().length > 0) score += 10;
        if ((n.wordCount || 0) > 20) score += 10;
        if (Array.isArray(n.tags) && n.tags.length > 0) score += 5;

        // Depth (25 pts): word count
        const wc = n.wordCount || 0;
        if (wc >= 300) score += 25;
        else if (wc >= 100) score += 15;
        else if (wc >= 50) score += 8;

        // Structure (20 pts): headings, lists
        const content = n.content || '';
        if (content.includes('\n# ') || content.includes('\n## ') || content.startsWith('# ')) score += 12;
        if (content.includes('\n- ') || content.includes('\n* ') || content.includes('\n1. ')) score += 8;

        // Connectedness (15 pts): has links to other notes
        if (Array.isArray(n.links) && n.links.length > 0) score += 15;

        // Freshness (15 pts): edited recently
        const daysSince = (Date.now() - new Date(n.updatedAt).getTime()) / DAY_MS;
        if (daysSince < 1) score += 15;
        else if (daysSince < 7) score += 10;
        else if (daysSince < 30) score += 5;

        total += Math.min(score, 100);
    }

    return Math.round(safeDiv(total, sample.length));
}

// ─── Productivity Patterns ──────────────────────────────────

function computeProductivityPatterns(activities: NoteActivity[]): ProductivityPattern {
    const editActivities = activities.filter(a => a.action === 'edit');
    if (editActivities.length === 0) return DEFAULT_PATTERNS;

    const dayScores = [0, 0, 0, 0, 0, 0, 0];
    const hourScores = new Array(24).fill(0) as number[];

    for (const a of editActivities) {
        const d = new Date(a.timestamp);
        const weight = Math.max(1, Math.abs(a.wordDelta || 1));
        dayScores[d.getDay()] += weight;
        hourScores[d.getHours()] += weight;
    }

    // Normalize to 0-100 scale
    const maxDay = safeMax(dayScores);
    const maxHour = safeMax(hourScores);
    if (maxDay === 0 && maxHour === 0) return DEFAULT_PATTERNS;

    const normDays = dayScores.map(s => maxDay > 0 ? Math.round(safeDiv(s, maxDay) * 100) : 0);
    const normHours = hourScores.map(s => maxHour > 0 ? Math.round(safeDiv(s, maxHour) * 100) : 0);

    const peakDayIdx = normDays.indexOf(safeMax(normDays));
    const lowDayIdx = normDays.indexOf(Math.min(...normDays));
    const peakHourIdx = normHours.indexOf(safeMax(normHours));
    const lowHourIdx = normHours.indexOf(Math.min(...normHours));

    const formatHour = (h: number) => {
        if (h === 0) return '12 AM';
        if (h < 12) return `${h} AM`;
        if (h === 12) return '12 PM';
        return `${h - 12} PM`;
    };

    // Find best 2-hour window
    let bestWindowStart = 0;
    let bestWindowScore = 0;
    for (let h = 0; h < 23; h++) {
        const windowScore = hourScores[h] + hourScores[h + 1];
        if (windowScore > bestWindowScore) {
            bestWindowScore = windowScore;
            bestWindowStart = h;
        }
    }

    const peakWindow = `${SHORT_DAYS[peakDayIdx]} ${formatHour(bestWindowStart)}–${formatHour(bestWindowStart + 2)}`;

    return {
        dayScores: normDays,
        hourScores: normHours,
        peakDay: DAYS[peakDayIdx],
        peakHour: formatHour(peakHourIdx),
        lowDay: DAYS[lowDayIdx],
        lowHour: formatHour(lowHourIdx),
        peakWindow,
    };
}

// ─── Task Intelligence ──────────────────────────────────────

function computeTaskIntelligence(
    items: { urgency: string; text: string; noteId: string; createdAt?: number }[]
): TaskIntelligence {
    if (items.length === 0) return DEFAULT_TASKS;

    const total = items.length;
    const highCount = items.filter(i => i.urgency === 'high').length;
    const mediumCount = items.filter(i => i.urgency === 'medium').length;
    const lowCount = total - highCount - mediumCount; // everything else is low

    const now = Date.now();
    const ages = items.map(i => {
        if (i.createdAt && i.createdAt > 0 && i.createdAt < now) {
            return (now - i.createdAt) / DAY_MS;
        }
        return 3; // reasonable default
    });

    const oldestDays = Math.round(safeMax(ages));
    const avgAgeDays = Math.round(safeDiv(ages.reduce((s, a) => s + a, 0), ages.length) * 10) / 10;
    const atRiskCount = ages.filter(a => a > 7).length;

    return { total, highCount, mediumCount, lowCount, oldestDays, avgAgeDays, atRiskCount };
}

// ─── Today's Insights ───────────────────────────────────────

function computeTodayInsights(
    writing: WritingIntelligence,
    streak: StreakIntelligence,
    patterns: ProductivityPattern,
    tasks: TaskIntelligence
): TodayInsight[] {
    const insights: TodayInsight[] = [];
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    // 1. Peak hour awareness
    if (patterns.hourScores[hour] >= 70) {
        insights.push({
            icon: '⚡',
            text: `It's your peak productivity time! You do your best work around ${patterns.peakHour}.`,
            type: 'positive',
        });
    }

    // 2. Today's activity vs average
    if (writing.todayVsAvg >= 2) {
        insights.push({
            icon: '🔥',
            text: `You've edited ${writing.todayNotes} notes today — ${writing.todayVsAvg}x your daily average!`,
            type: 'positive',
        });
    } else if (writing.todayNotes === 0 && hour >= 14) {
        insights.push({
            icon: '📝',
            text: 'No notes edited yet today. Your streak needs at least one edit!',
            type: 'warning',
            cta: { label: 'Write now', action: 'write_now' }
        });
    }

    // 3. Streak context
    if (streak.current > 0) {
        if (streak.current >= streak.longest && streak.current > 1) {
            insights.push({
                icon: '🏆',
                text: `You're at your all-time longest streak of ${streak.current} days!`,
                type: 'positive',
            });
        } else if (streak.usualBreakDay && streak.usualBreakDay === DAYS[dayOfWeek]) {
            insights.push({
                icon: '⚠️',
                text: `Streaks tend to break on ${streak.usualBreakDay}s. Stay focused today!`,
                type: 'warning',
            });
        }
    }

    // 4. Writing trend
    if (writing.weeklyTrend > 20) {
        insights.push({
            icon: '📈',
            text: `Writing activity up ${writing.weeklyTrend}% vs last week. Momentum building!`,
            type: 'positive',
        });
    } else if (writing.weeklyTrend < -30) {
        insights.push({
            icon: '📉',
            text: `Writing down ${Math.abs(writing.weeklyTrend)}% vs last week. Time to refocus?`,
            type: 'warning',
        });
    }

    // 5. Quality note
    if (writing.qualityScore >= 80) {
        insights.push({
            icon: '✨',
            text: `Quality score: ${writing.qualityScore}/100 — your notes are well-structured and detailed!`,
            type: 'positive',
        });
    } else if (writing.qualityScore > 0 && writing.qualityScore < 40 && writing.totalNotes >= 5) {
        insights.push({
            icon: '💡',
            text: `Quality score: ${writing.qualityScore}/100. Add titles, tags, and structure to boost it.`,
            type: 'neutral',
            cta: { label: 'Improve notes', action: 'improve_quality' }
        });
    }

    // 6. Stalled notes
    if (writing.stalledNotes.length > 0) {
        const stalled = writing.stalledNotes[0];
        insights.push({
            icon: '🕐',
            text: `"${stalled.title}" hasn't been updated in ${stalled.daysSince} days.`,
            type: 'neutral',
            cta: { label: 'Review note', action: 'view_stalled', payload: stalled.id }
        });
    }

    // 7. High-priority tasks
    if (tasks.highCount >= 3) {
        insights.push({
            icon: '🚨',
            text: `${tasks.highCount} high-priority action items need attention.`,
            type: 'warning',
            cta: { label: 'View Tasks', action: 'scroll_to_actions' }
        });
    } else if (tasks.highCount > 0) {
        insights.push({
            icon: '🎯',
            text: `${tasks.highCount} high-priority action item${tasks.highCount > 1 ? 's' : ''} waiting.`,
            type: 'neutral',
        });
    }

    // 8. At-risk aging tasks
    if (tasks.atRiskCount > 0) {
        insights.push({
            icon: '⏳',
            text: `${tasks.atRiskCount} task${tasks.atRiskCount > 1 ? 's' : ''} aging past 7 days — consider triaging.`,
            type: 'warning',
            cta: { label: 'Triaging', action: 'scroll_to_actions' }
        });
    }

    // 9. Best day motivation
    if (DAYS[dayOfWeek] === patterns.peakDay && patterns.peakDay !== '—') {
        insights.push({
            icon: '🎯',
            text: `${patterns.peakDay} is your most productive day. Make it count!`,
            type: 'positive',
        });
    }

    // Return top 5 most relevant
    return insights.slice(0, 5);
}
