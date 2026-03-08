import type { DailyActivity } from './db';

export interface StreakRun {
  start: string;
  end: string;
  length: number;
  isCurrent: boolean;
}

export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseLocalDateKey(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function addDays(dateKey: string, delta: number): string {
  const d = parseLocalDateKey(dateKey);
  d.setDate(d.getDate() + delta);
  return localDateKey(d);
}

function isNextLocalDate(prev: string, next: string): boolean {
  const p = parseLocalDateKey(prev);
  p.setDate(p.getDate() + 1);
  return localDateKey(p) === next;
}

export function buildStreakRuns(
  activity: Array<Pick<DailyActivity, 'date' | 'notesEdited'>>,
  streak: number,
  todayActive: boolean,
  today: string = localDateKey(new Date())
): StreakRun[] {
  const activeDates = Array.from(
    new Set(
      activity
        .filter((d) => d.notesEdited > 0 && /^\d{4}-\d{2}-\d{2}$/.test(d.date))
        .map((d) => d.date)
    )
  ).sort();

  if (activeDates.length === 0) return [];

  const runs: StreakRun[] = [];
  let start = activeDates[0];
  let end = activeDates[0];
  let length = 1;

  for (let i = 1; i < activeDates.length; i++) {
    const date = activeDates[i];
    if (isNextLocalDate(end, date)) {
      end = date;
      length += 1;
    } else {
      runs.push({ start, end, length, isCurrent: false });
      start = date;
      end = date;
      length = 1;
    }
  }
  runs.push({ start, end, length, isCurrent: false });

  let currentStart: string | null = null;
  let currentEnd: string | null = null;
  if (streak > 0) {
    currentEnd = todayActive ? today : addDays(today, -1);
    currentStart = addDays(currentEnd, -(streak - 1));
  }

  return runs
    .map((run) => ({
      ...run,
      isCurrent: !!currentStart && !!currentEnd && run.start === currentStart && run.end === currentEnd && run.length === streak,
    }))
    .reverse();
}

