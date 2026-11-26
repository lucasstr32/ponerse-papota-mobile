import { num } from './num';
import { formatRepTarget } from './reps';

export interface WaveSegment {
  sets: number;
  /** Normalized target: "6", "8–10" or "máx". */
  reps: string;
  /** Weight in kg, or the percentage of the reference max when `pct` is true. */
  kg: number;
  pct: boolean;
}

export type WaveWeek = WaveSegment[];

// Lowercasing the line first keeps "Á" handling out of the regex flags (Hermes).
const SEGMENT = /(\d+)\s*[x×]\s*(máx|max|\d+(?:\s*[–-]\s*\d+)?)\s*@\s*(\d+(?:[.,]\d+)?%?)/gi;
const RANGE = /^(\d+)\s*[–-]\s*(\d+)$/;

function normalizeReps(raw: string): string {
  if (raw === 'máx' || raw === 'max') return 'máx';
  const m = RANGE.exec(raw);
  if (m === null) return String(Number(raw));
  return formatRepTarget(Number(m[1]), Number(m[2]));
}

/** Parses the weekly wave text: one week per line, segments joined by "+". */
export function parseWeeks(text: string): WaveWeek[] {
  const weeks: WaveWeek[] = [];
  for (const line of text.split(/\r?\n/)) {
    const segments: WaveSegment[] = [];
    for (const m of line.toLowerCase().matchAll(SEGMENT)) {
      const sets = Number(m[1]);
      if (sets === 0) continue;
      const rawKg = m[3] ?? '';
      const pct = rawKg.endsWith('%');
      const kg = num(pct ? rawKg.slice(0, -1) : rawKg);
      if (kg === null) continue;
      segments.push({ sets, reps: normalizeReps(m[2] ?? ''), kg, pct });
    }
    if (segments.length > 0) weeks.push(segments);
  }
  return weeks;
}
