import type { EntryRecord, SessionRecord, SetRecord, SlotConfig } from './types';

/** Work and control sets of an entry (warm-ups excluded). */
export function workSets(entry: EntryRecord): SetRecord[] {
  return entry.sets.filter((s) => s.type !== 'warmup');
}

/** True when at least one work set has reps loaded (zero counts as loaded). */
export function hasWork(entry: EntryRecord): boolean {
  return workSets(entry).some((s) => s.reps !== null);
}

/** Reps of the work sets that have them, in order. */
export function loggedReps(entry: EntryRecord): number[] {
  return workSets(entry).flatMap((s) => (s.reps === null ? [] : [s.reps]));
}

function time(iso: string): number {
  return Date.parse(iso);
}

export interface ExerciseSet {
  sessionId: string;
  createdAt: string;
  set: SetRecord;
}

/**
 * Work and control sets with reps of an exercise across sessions, oldest first (then by
 * entry and set order). Sessions created at the same time are ordered by id. Counts every
 * entry of the exercise, including ones that replace a slot. Skips the excluded session.
 * Precondition: every `createdAt` is a valid date (the data layer validates it).
 */
export function exerciseSets(
  sessions: readonly SessionRecord[],
  exerciseId: string,
  excludeSessionId: string | null = null,
): ExerciseSet[] {
  const sorted = [...sessions].sort(
    (a, b) => time(a.createdAt) - time(b.createdAt) || (a.id < b.id ? -1 : 1),
  );
  return sorted.flatMap((session) =>
    session.id === excludeSessionId
      ? []
      : session.entries
          .filter((entry) => entry.exerciseId === exerciseId)
          .flatMap((entry) => workSets(entry))
          .filter((set) => set.reps !== null && set.reps > 0)
          .map((set) => ({ sessionId: session.id, createdAt: session.createdAt, set })),
  );
}

export interface SlotHistoryItem {
  sessionId: string;
  createdAt: string;
  entry: EntryRecord;
}

/**
 * Entries of a slot from earlier sessions, oldest first, with the session they belong to.
 * Skips the current session and later ones, anything at or before the slot reset,
 * replaced entries and entries without work. One entry per session: the first one with work.
 */
export function slotTimeline(
  sessions: readonly SessionRecord[],
  slot: SlotConfig,
  current?: { id: string; createdAt: string },
): SlotHistoryItem[] {
  const sorted = [...sessions].sort((a, b) => time(a.createdAt) - time(b.createdAt));
  const history: SlotHistoryItem[] = [];
  for (const session of sorted) {
    if (current !== undefined) {
      if (session.id === current.id) continue;
      if (!(time(session.createdAt) < time(current.createdAt))) continue;
    }
    if (slot.resetAt !== null && !(time(session.createdAt) > time(slot.resetAt))) continue;
    const entry = session.entries.find(
      (e) => e.slotUid === slot.uid && e.replacesSlotUid === null && hasWork(e),
    );
    if (entry !== undefined)
      history.push({ sessionId: session.id, createdAt: session.createdAt, entry });
  }
  return history;
}

/** Entries of a slot from earlier sessions, oldest first (see `slotTimeline`). */
export function slotHistory(
  sessions: readonly SessionRecord[],
  slot: SlotConfig,
  current?: { id: string; createdAt: string },
): EntryRecord[] {
  return slotTimeline(sessions, slot, current).map((item) => item.entry);
}
