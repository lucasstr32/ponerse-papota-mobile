import { exerciseSets } from './history';
import { round25 } from './math';
import { controlOneRm, personalRecords } from './records';
import type { SessionRecord, SlotConfig } from './types';
import { formatWeeks, parseWeeks } from './weeks';
import type { WaveWeek } from './weeks';

/** Share of the best estimated 1RM taken as the new reference when there is no control. */
const RECORD_FACTOR = 0.95;

export type ReferenceSource = 'control' | 'record';

export interface NextReferenceResult {
  next: number;
  source: ReferenceSource;
  sessionId: string;
}

/**
 * New reference max of an exercise from the sessions of the closing block: the last usable
 * control set, or else the best estimated 1RM times 0.95. Null when there is neither.
 */
export function nextReference(
  sessions: readonly SessionRecord[],
  exerciseId: string,
): NextReferenceResult | null {
  const controls = exerciseSets(sessions, exerciseId).flatMap(({ sessionId, set }) => {
    const next = set.type === 'control' ? controlOneRm(set) : null;
    return next === null ? [] : [{ next, source: 'control' as const, sessionId }];
  });
  const lastControl = controls[controls.length - 1];
  if (lastControl !== undefined) return lastControl;
  const record = personalRecords(sessions, exerciseId).oneRm;
  if (record === null) return null;
  return { next: record.oneRm * RECORD_FACTOR, source: 'record', sessionId: record.sessionId };
}

/**
 * Rescales the fixed weights of the weeks from one reference max to another. Percentages
 * stay as they are. When the previous reference is not a positive finite number there is
 * nothing to scale from, so the weeks come back unchanged.
 */
export function scaleWeeks(
  weeks: readonly WaveWeek[],
  previousRef: number,
  nextRef: number,
): WaveWeek[] {
  const scalable = previousRef > 0 && Number.isFinite(previousRef);
  return weeks.map((week) =>
    week.map((s) =>
      s.pct || !scalable ? { ...s } : { ...s, kg: round25((s.kg / previousRef) * nextRef) },
    ),
  );
}

export interface NextBlockInput {
  slots: readonly SlotConfig[];
  /** Reference max of each exercise in the closing block. */
  refOneRm: Readonly<Record<string, number>>;
  /** Sessions of the closing block. */
  sessions: readonly SessionRecord[];
}

export interface NextReference {
  exerciseId: string;
  previous: number;
  next: number;
  source: ReferenceSource;
  sessionId: string;
}

export interface NextBlockSlot {
  uid: string;
  weeks: string;
  offsetKg: number;
}

/**
 * Proposal for the next block. Only wave slots with a positive reference, valid weeks and a
 * new reference change; every other slot keeps its weeks and offset and is left out.
 * Exercises whose previous reference is not positive get no reference either.
 */
export function planNextBlock(input: NextBlockInput): {
  references: NextReference[];
  slots: NextBlockSlot[];
} {
  const references: NextReference[] = [];
  for (const [exerciseId, previous] of Object.entries(input.refOneRm)) {
    const ref = nextReference(input.sessions, exerciseId);
    if (ref !== null && previous > 0) references.push({ exerciseId, previous, ...ref });
  }
  const slots: NextBlockSlot[] = [];
  for (const slot of input.slots) {
    if (slot.mode !== 'wave') continue;
    const reference = references.find((r) => r.exerciseId === slot.exerciseId);
    if (reference === undefined) continue;
    const weeks = parseWeeks(slot.weeks);
    if (weeks.length === 0) continue;
    slots.push({
      uid: slot.uid,
      weeks: formatWeeks(scaleWeeks(weeks, reference.previous, reference.next)),
      offsetKg: 0,
    });
  }
  return { references, slots };
}
