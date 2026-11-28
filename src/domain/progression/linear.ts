import { workSets } from '../history';
import { round25, snapKg } from '../math';
import { formatRepTarget, repMin } from '../reps';
import type { EntryRecord, ExerciseInfo, LinearOutcome, SlotConfig } from '../types';
import { uniformSets } from './range';
import type { Plan } from './range';

interface LinearState {
  kg: number | null;
  fails: number;
  lastOutcome: LinearOutcome | null;
}

function loadedWeights(entry: EntryRecord): number[] {
  return workSets(entry).flatMap((s) => (s.kg === null ? [] : [s.kg]));
}

/**
 * Whether a recorded session counts as achieved: every work set has the reps of the first
 * set's target, is not marked as failed and reaches the target weight (or has none loaded).
 */
export function isAchieved(entry: EntryRecord, slot: SlotConfig): boolean {
  const sets = workSets(entry);
  const first = sets[0];
  const target = first?.targetKg ?? null;
  const tr = repMin(first?.targetReps ?? '') ?? slot.repMin;
  return sets.every(
    (s) =>
      !s.failed &&
      s.reps !== null &&
      s.reps >= tr &&
      (target === null || s.kg === null || s.kg >= target - 1e-9),
  );
}

/** Applies one recorded session to the running linear state. */
function step(state: LinearState, entry: EntryRecord, slot: SlotConfig, inc: number): LinearState {
  const target = workSets(entry)[0]?.targetKg ?? null;
  const loaded = loadedWeights(entry);
  // With no target weight, the heaviest loaded weight stands in for it.
  const tw = target ?? (loaded.length === 0 ? null : Math.max(...loaded));
  if (isAchieved(entry, slot)) {
    return { kg: tw === null ? state.kg : snapKg(tw + inc), fails: 0, lastOutcome: 'achieved' };
  }
  const base = tw ?? state.kg;
  if (state.fails + 1 >= 2) {
    return {
      kg: base === null ? null : snapKg(round25(base * 0.9)),
      fails: 0,
      lastOutcome: 'deload',
    };
  }
  return { kg: base, fails: state.fails + 1, lastOutcome: 'firstFail' };
}

/**
 * Linear progression: add the increment after each achieved session, deload after two fails.
 * `bumpsKg[i]` is an accepted raise for session `i`: it is added once to the weight that
 * session leaves, and the next session's target already carries it. The slot offset is ignored.
 */
export function planLinear(
  slot: SlotConfig,
  exercise: ExerciseInfo,
  history: readonly EntryRecord[],
  bumpsKg: readonly number[] = [],
): Plan {
  const inc = slot.increment ?? exercise.increment;
  const initial: LinearState = { kg: slot.kg, fails: 0, lastOutcome: null };
  const state = history.reduce((s, entry, i) => {
    const next = step(s, entry, slot, inc);
    const bump = bumpsKg[i] ?? 0;
    return next.kg === null ? next : { ...next, kg: snapKg(next.kg + bump) };
  }, initial);
  return {
    sets: uniformSets(slot.sets, state.kg, formatRepTarget(slot.repMin, slot.repMax)),
    info: { mode: 'linear', fails: state.fails, lastOutcome: state.lastOutcome },
  };
}
