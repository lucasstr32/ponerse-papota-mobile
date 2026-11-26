import { snapKg } from '../math';
import type { ExerciseInfo, PlannedSet, SlotConfig } from '../types';
import { parseWeeks } from '../weeks';
import type { WaveSegment } from '../weeks';
import type { Plan } from './range';

function segmentSets(segment: WaveSegment, targetKg: number | null): PlannedSet[] {
  const control = segment.reps === 'máx';
  return Array.from({ length: segment.sets }, () => ({
    type: control ? 'control' : 'work',
    targetKg,
    targetReps: segment.reps,
  }));
}

/**
 * Weekly wave: week is `n mod L`, each full cycle adds the increment, and a deload week
 * uses the last line. `n` is the number of sessions already done.
 */
export function planWave(
  slot: SlotConfig,
  exercise: ExerciseInfo,
  n: number,
  options: { deload: boolean },
): Plan {
  const weeks = parseWeeks(slot.weeks);
  const count = weeks.length;
  const cycle = count === 0 ? 0 : Math.floor(n / count);
  const week = count === 0 ? 0 : options.deload ? count - 1 : n % count;
  const info = {
    mode: 'wave',
    cycle,
    week,
    weeksCount: count,
    deload: options.deload,
    invalidWeeks: count === 0,
  } as const;
  const lines = weeks[week] ?? [];
  const inc = slot.increment ?? exercise.increment;
  const sets = lines.flatMap((segment) =>
    segmentSets(segment, segment.pct ? null : snapKg(segment.kg + cycle * inc + slot.offsetKg)),
  );
  return { sets, info };
}
