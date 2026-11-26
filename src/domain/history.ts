import type { EntryRecord, SessionRecord, SetRecord, SlotConfig } from './types';

/** Work and control sets of an entry (warm-ups excluded). */
export function workSets(entry: EntryRecord): SetRecord[] {
  return entry.sets.filter((s) => s.type !== 'warmup');
}

/** True when at least one work set has reps loaded (zero counts as loaded). */
export function hasWork(entry: EntryRecord): boolean {
  return workSets(entry).some((s) => s.reps !== null);
}

function time(iso: string): number {
  return Date.parse(iso);
}

/**
 * Entries of a slot from earlier sessions, oldest first. Skips the current session and
 * later ones, anything at or before the slot reset, replaced entries and entries
 * without work. One entry per session: the first one with work.
 */
export function slotHistory(
  sessions: readonly SessionRecord[],
  slot: SlotConfig,
  current?: { id: string; createdAt: string },
): EntryRecord[] {
  const sorted = [...sessions].sort((a, b) => time(a.createdAt) - time(b.createdAt));
  const history: EntryRecord[] = [];
  for (const session of sorted) {
    if (current !== undefined) {
      if (session.id === current.id) continue;
      if (!(time(session.createdAt) < time(current.createdAt))) continue;
    }
    if (slot.resetAt !== null && !(time(session.createdAt) > time(slot.resetAt))) continue;
    const entry = session.entries.find(
      (e) => e.slotUid === slot.uid && e.replacesSlotUid === null && hasWork(e),
    );
    if (entry !== undefined) history.push(entry);
  }
  return history;
}
