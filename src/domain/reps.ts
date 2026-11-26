const RANGE = /^(\d+)\s*[–-]\s*(\d+)$/;
const SINGLE = /^\d+$/;
const MAX = /^m[aá]x$/i;

type Parsed = { min: number; max: number | null } | null;

function parse(text: string): Parsed {
  const t = text.trim();
  if (MAX.test(t)) return { min: 1, max: null };
  if (SINGLE.test(t)) return { min: Number(t), max: Number(t) };
  const m = RANGE.exec(t);
  if (m === null) return null;
  return { min: Number(m[1]), max: Number(m[2]) };
}

/** Lower end of a rep target ("8–12" gives 8, "máx" gives 1). Null when invalid. */
export function repMin(text: string): number | null {
  return parse(text)?.min ?? null;
}

/** Upper end of a rep target. Null for "máx" and for invalid text. */
export function repMax(text: string): number | null {
  return parse(text)?.max ?? null;
}

/** Writes a rep target with an en dash, or a single number when both ends match. */
export function formatRepTarget(min: number, max: number): string {
  return min === max ? String(min) : `${min}–${max}`;
}
