import { loggedReps, workSets } from '../history';
import { snapKg } from '../math';
import { formatRepTarget } from '../reps';
import type { EngineInfo, EntryRecord, ExerciseInfo, PlannedSet, SlotConfig } from '../types';

export interface Plan {
  sets: PlannedSet[];
  info: EngineInfo;
}

/** Builds `count` identical work sets for the target. */
export function uniformSets(
  count: number,
  targetKg: number | null,
  targetReps: string,
): PlannedSet[] {
  return Array.from({ length: count }, () => ({ type: 'work', targetKg, targetReps }));
}

/** Heaviest weight of the work sets of an entry; a set with reps but no weight counts at its target. Null when none has one. */
export function heaviest(entry: EntryRecord): number | null {
  const weights = workSets(entry).flatMap((s) => {
    const kg = s.kg ?? (s.reps === null ? null : s.targetKg);
    return kg === null ? [] : [kg];
  });
  return weights.length === 0 ? null : Math.max(...weights);
}

/** Double progression: raise the weight once every planned set reached the top of the range. */
export function planRange(
  slot: SlotConfig,
  exercise: ExerciseInfo,
  history: readonly EntryRecord[],
): Plan {
  const reps = formatRepTarget(slot.repMin, slot.repMax);
  const last = history[history.length - 1];
  const info: EngineInfo = { mode: 'range' };
  if (last === undefined) return { sets: uniformSets(slot.sets, slot.kg, reps), info };

  const lw = heaviest(last);
  const logged = loggedReps(last);
  const allTop = logged.length >= slot.sets && logged.every((r) => r >= slot.repMax);
  const increment = slot.increment ?? exercise.increment;
  const loaded = lw !== null && (!exercise.bodyweight || lw > 0);
  const target = allTop && increment > 0 && loaded ? snapKg(lw + increment) : (lw ?? slot.kg);
  return { sets: uniformSets(slot.sets, target, reps), info };
}
