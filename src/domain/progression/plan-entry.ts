import { slotHistory } from '../history';
import { formatRepTarget } from '../reps';
import type { ExerciseInfo, PlannedSet, SessionRecord, SlotConfig } from '../types';
import { warmupSets } from '../warmup';
import { planLinear } from './linear';
import { planRange, uniformSets } from './range';
import type { Plan } from './range';
import { planWave } from './wave';

export interface PlanEntryInput {
  slot: SlotConfig;
  exercise: ExerciseInfo;
  sessions: readonly SessionRecord[];
  current?: { id: string; createdAt: string };
  deload: boolean;
}

function planFree(slot: SlotConfig): Plan {
  return {
    sets: uniformSets(slot.sets, slot.kg, formatRepTarget(slot.repMin, slot.repMax)),
    info: { mode: 'free' },
  };
}

function planByMode({ slot, exercise, sessions, current, deload }: PlanEntryInput): Plan {
  const history = slotHistory(sessions, slot, current);
  switch (slot.mode) {
    case 'range':
      return planRange(slot, exercise, history);
    case 'linear':
      return planLinear(slot, exercise, history);
    case 'wave': {
      const wave = planWave(slot, exercise, history.length, { deload });
      return wave.info.mode === 'wave' && wave.info.invalidWeeks
        ? { sets: planFree(slot).sets, info: wave.info }
        : wave;
    }
    case 'free':
      return planFree(slot);
  }
}

/** Target sets for one slot of a session: warm-ups first, then the mode's work sets. */
export function planEntry(input: PlanEntryInput): Plan {
  const plan = planByMode(input);
  const weights = plan.sets.flatMap((s) => (s.targetKg === null ? [] : [s.targetKg]));
  const top = weights.length === 0 ? null : Math.max(...weights);
  const warmups: PlannedSet[] = warmupSets(input.slot.warmup, top, input.exercise);
  return { sets: [...warmups, ...plan.sets], info: plan.info };
}
