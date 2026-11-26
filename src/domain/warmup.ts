import { round25 } from './math';
import type { ExerciseInfo, PlannedSet, WarmupLevel } from './types';

type Step = { kg: number; reps: number };

/** Warm-up sets for a top working weight. Duplicates and weights outside (0, top) are dropped. */
export function warmupSets(
  level: WarmupLevel,
  top: number | null,
  exercise: ExerciseInfo,
): PlannedSet[] {
  if (level === 'none' || top === null || top <= 0) return [];
  const steps: Step[] = [];
  if (level === 'one') {
    steps.push({ kg: round25((top * 60) / 100), reps: 5 });
  } else {
    if (exercise.equipment === 'barbell' && !exercise.fromFloor && top >= 40) {
      steps.push({ kg: 20, reps: 10 });
    }
    steps.push({ kg: round25((top * 50) / 100), reps: 5 });
    steps.push({ kg: round25((top * 70) / 100), reps: 3 });
    steps.push({ kg: round25((top * 85) / 100), reps: top < 60 ? 1 : 2 });
  }
  const seen = new Set<number>();
  const sets: PlannedSet[] = [];
  for (const { kg, reps } of steps) {
    if (kg <= 0 || kg >= top || seen.has(kg)) continue;
    seen.add(kg);
    sets.push({ type: 'warmup', targetKg: kg, targetReps: String(reps) });
  }
  return sets;
}
