import { slotTimeline, workSets } from './history';
import type { SlotHistoryItem } from './history';
import { round25, snapKg } from './math';
import { isAchieved } from './progression/linear';
import { planWave } from './progression/wave';
import { repMax, repMin } from './reps';
import { parseWeeks } from './weeks';
import type {
  AdjustmentLog,
  AdjustmentProposal,
  AdjustmentRule,
  BlockWeek,
  EntryRecord,
  ExerciseInfo,
  ProgressionMode,
  SessionRecord,
  SetRecord,
  SlotConfig,
} from './types';

/**
 * Reps in reserve a text asks for. A range gives its upper end ("1–2" gives 2);
 * anything unreadable ("control", empty) gives null.
 */
export function parseRirTarget(text: string): number | null {
  return repMax(text);
}

/**
 * Reserve target of a slot. Wave and linear take it from the block week, so without a
 * block there is none. The other modes take the slot's own target.
 */
export function rirTargetFor(
  mode: ProgressionMode,
  blockWeek: BlockWeek | null,
  slotRir: string | null,
): number | null {
  if (mode === 'wave' || mode === 'linear') {
    return blockWeek === null ? null : parseRirTarget(blockWeek.rir);
  }
  return slotRir === null ? null : parseRirTarget(slotRir);
}

const PRECEDENCE: readonly AdjustmentRule[] = ['down', 'hold', 'up'];

/** Rule accepted for a slot in a session. With several, down beats hold beats up. */
export function acceptedRule(
  adjustments: readonly AdjustmentLog[],
  slotUid: string,
  sessionId: string,
): AdjustmentRule | null {
  const rules = adjustments
    .filter((a) => a.accepted && a.slotUid === slotUid && a.sessionId === sessionId)
    .map((a) => a.rule);
  return PRECEDENCE.find((rule) => rules.includes(rule)) ?? null;
}

/**
 * Effective wave index `n` for the slot's next session. A held or lowered session does not
 * advance the wave, so the failed week repeats. Only accepted logs of the slot count.
 */
export function waveIndex(
  slotUid: string,
  timeline: readonly SlotHistoryItem[],
  adjustments: readonly AdjustmentLog[],
): number {
  return timeline.reduce((n, item) => {
    const rule = acceptedRule(adjustments, slotUid, item.sessionId);
    return rule === 'hold' || rule === 'down' ? n : n + 1;
  }, 0);
}

/** A set counts as missed when it is marked failed, has no reps or falls under the minimum. */
export function isMissedSet(set: SetRecord, fallbackMin: number): boolean {
  return set.failed || set.reps === null || set.reps < (repMin(set.targetReps) ?? fallbackMin);
}

export interface ProposeAdjustmentInput {
  slot: SlotConfig;
  exercise: ExerciseInfo;
  sessions: readonly SessionRecord[];
  /** The session being worked on. It is left out of the history even if saved in `sessions`. */
  current: { id: string; createdAt: string };
  entry: EntryRecord;
  adjustments: readonly AdjustmentLog[];
  blockWeek: BlockWeek | null;
}

const EXTRA_RESERVE = 2;

/** Heaviest planned weight of week `n`, ignoring the offset. Null when it is only percentages. */
function weekTopKg(slot: SlotConfig, exercise: ExerciseInfo, n: number): number | null {
  const plan = planWave({ ...slot, offsetKg: 0 }, exercise, n, { deload: false });
  const weights = plan.sets.flatMap((s) => (s.targetKg === null ? [] : [s.targetKg]));
  return weights.length === 0 ? null : Math.max(...weights);
}

/**
 * Load adjustment to offer after a session of a wave or linear slot, or null for none.
 * Down beats hold beats up. A wave slot with unreadable weeks, or on a week with a max
 * set, gets none.
 */
export function proposeAdjustment(input: ProposeAdjustmentInput): AdjustmentProposal | null {
  const { slot, exercise, sessions, current, entry, adjustments, blockWeek } = input;
  if (slot.mode !== 'wave' && slot.mode !== 'linear') return null;
  if (entry.slotUid !== slot.uid || entry.replacesSlotUid !== null) return null;
  const sets = workSets(entry);
  if (sets.length === 0) return null;
  if (blockWeek?.deload === true) return null;
  const rirTarget = rirTargetFor(slot.mode, blockWeek, null);
  if (blockWeek !== null && rirTarget === null) return null;

  const missed = sets.some((s) => isMissedSet(s, slot.repMin));
  const extraReserve =
    rirTarget !== null && sets.every((s) => s.rir !== null && s.rir >= rirTarget + EXTRA_RESERVE);
  const inc = slot.increment ?? exercise.increment;
  const offsetBefore = slot.offsetKg;
  const raise: AdjustmentProposal = {
    rule: 'up',
    reason: 'extraReserve',
    offsetBefore,
    offsetAfter: snapKg(offsetBefore + inc),
  };

  if (slot.mode === 'linear') {
    return !missed && extraReserve && isAchieved(entry, slot) ? raise : null;
  }

  const weeks = parseWeeks(slot.weeks);
  if (weeks.length === 0) return null;
  const timeline = slotTimeline(sessions, slot, current);
  const n = waveIndex(slot.uid, timeline, adjustments);
  if (weeks[n % weeks.length]?.some((segment) => segment.reps === 'máx') === true) return null;

  if (missed) {
    const previous = timeline[timeline.length - 1];
    const missedTwice =
      previous !== undefined &&
      acceptedRule(adjustments, slot.uid, previous.sessionId) !== 'down' &&
      workSets(previous.entry).some((s) => isMissedSet(s, slot.repMin));
    const peso = missedTwice ? weekTopKg(slot, exercise, n) : null;
    if (peso !== null) {
      return {
        rule: 'down',
        reason: 'missedTwice',
        offsetBefore,
        offsetAfter: snapKg(round25((peso + offsetBefore) * 0.9) - peso),
      };
    }
    return { rule: 'hold', reason: 'missedReps', offsetBefore, offsetAfter: offsetBefore };
  }
  if (sets.some((s) => s.rir === 0)) {
    return { rule: 'hold', reason: 'rirZero', offsetBefore, offsetAfter: offsetBefore };
  }
  return extraReserve ? raise : null;
}
