import { acceptedRule, waveIndex } from '../adjustments';
import { slotTimeline } from '../history';
import type { SlotHistoryItem } from '../history';
import { snapKg } from '../math';
import { formatRepTarget } from '../reps';
import type {
  AdjustmentLog,
  EntryRecord,
  ExerciseInfo,
  PlannedSet,
  SessionRecord,
  SlotConfig,
} from '../types';
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
  adjustments: readonly AdjustmentLog[];
}

function planFree(slot: SlotConfig): Plan {
  return {
    sets: uniformSets(slot.sets, slot.kg, formatRepTarget(slot.repMin, slot.repMax)),
    info: { mode: 'free' },
  };
}

/**
 * Raise an accepted `up` log adds to the weight the session leaves, 0 without one.
 * `acceptedRule` decides first, so a hold or down accepted in the same session cancels the
 * raise; only then is the `up` log itself looked up for its offsets.
 */
function acceptedBump(adjustments: readonly AdjustmentLog[], slotUid: string, id: string): number {
  if (acceptedRule(adjustments, slotUid, id) !== 'up') return 0;
  const log = adjustments.find(
    (a) => a.accepted && a.rule === 'up' && a.slotUid === slotUid && a.sessionId === id,
  );
  return log === undefined ? 0 : snapKg(log.offsetAfter - log.offsetBefore);
}

function planByMode(
  { slot, exercise, deload, adjustments }: PlanEntryInput,
  timeline: readonly SlotHistoryItem[],
): Plan {
  const history = timeline.map((item) => item.entry);
  switch (slot.mode) {
    case 'range':
      return planRange(slot, exercise, history);
    case 'linear': {
      const bumps = timeline.map((item) => acceptedBump(adjustments, slot.uid, item.sessionId));
      return planLinear(slot, exercise, history, bumps);
    }
    case 'wave': {
      const n = waveIndex(slot.uid, timeline, adjustments);
      const wave = planWave(slot, exercise, n, { deload });
      return wave.info.invalidWeeks ? { sets: planFree(slot).sets, info: wave.info } : wave;
    }
    case 'free':
      return planFree(slot);
  }
}

/** Target sets for one slot of a session: warm-ups first, then the mode's work sets. */
export function planEntry(input: PlanEntryInput): Plan {
  const plan = planByMode(input, slotTimeline(input.sessions, input.slot, input.current));
  const weights = plan.sets.flatMap((s) => (s.targetKg === null ? [] : [s.targetKg]));
  const top = weights.length === 0 ? null : Math.max(...weights);
  const warmups: PlannedSet[] = warmupSets(input.slot.warmup, top, input.exercise);
  return { sets: [...warmups, ...plan.sets], info: plan.info };
}

/**
 * Target work sets for the session after the current one, if the current one ends with
 * `entry`. The entry is always added to the slot history, even without work, so a wave
 * moves on to the next week. The next session is planned as a regular one (no deload: its
 * block week is not known here), without warm-ups. Adjustment proposals are not applied;
 * accepted logs, including those of the current session, are. For double and linear
 * progression it is only meaningful once `entry` is complete: an unfinished entry is
 * planned as if the session ended there.
 */
export function planAfter(
  input: PlanEntryInput & { current: { id: string; createdAt: string } },
  entry: EntryRecord,
): Plan {
  const { slot, sessions, current } = input;
  const timeline: SlotHistoryItem[] = [
    ...slotTimeline(sessions, slot, current),
    { sessionId: current.id, createdAt: current.createdAt, entry },
  ];
  return planByMode({ ...input, deload: false }, timeline);
}
