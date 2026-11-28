import { loggedReps, workSets } from './history';
import { planAfter, planEntry } from './progression/plan-entry';
import type { PlanEntryInput } from './progression/plan-entry';
import { heaviest } from './progression/range';
import { formatRepTarget } from './reps';
import type { EntryRecord, LinearOutcome } from './types';

export type TargetMessage =
  | { mode: 'free' }
  | { mode: 'range'; kind: 'quality' }
  | {
      mode: 'range';
      kind: 'progress';
      sets: number;
      reps: number;
      kg: number | null;
      missing: number;
    }
  | { mode: 'range'; kind: 'achieved'; kg: number | null; reps: number }
  | { mode: 'range'; kind: 'addDifficulty' }
  | { mode: 'linear'; kind: 'pending'; sets: number; reps: string; kg: number | null }
  | { mode: 'linear'; kind: LinearOutcome; kg: number | null };

export interface TargetMessageInput extends PlanEntryInput {
  current: { id: string; createdAt: string };
  /** Live entry of the slot in the current session. */
  entry: EntryRecord;
}

/** A weight worth showing: zero, negative or missing weights give null. */
function positiveKg(kg: number | null | undefined): number | null {
  return kg === null || kg === undefined || kg <= 0 ? null : kg;
}

/** Heaviest target weight of the current session's work sets. */
function currentTargetKg(input: TargetMessageInput): number | null {
  const plan = planEntry({ ...input, slot: { ...input.slot, warmup: 'none' } });
  return plan.sets[0]?.targetKg ?? null;
}

function rangeMessage(input: TargetMessageInput): TargetMessage {
  const { slot, exercise, entry } = input;
  const increment = slot.increment ?? exercise.increment;
  if (increment === 0 && slot.repMin === slot.repMax) return { mode: 'range', kind: 'quality' };

  const logged = loggedReps(entry);
  const missing =
    logged.reduce((sum, r) => sum + Math.max(0, slot.repMax - r), 0) +
    Math.max(0, slot.sets - logged.length) * slot.repMax;
  const loaded = heaviest(entry);
  if (missing > 0) {
    return {
      mode: 'range',
      kind: 'progress',
      sets: slot.sets,
      reps: slot.repMax,
      kg: positiveKg(loaded ?? currentTargetKg(input)),
      missing,
    };
  }
  if (exercise.bodyweight && (loaded === null || loaded <= 0)) {
    return { mode: 'range', kind: 'addDifficulty' };
  }
  return {
    mode: 'range',
    kind: 'achieved',
    kg: positiveKg(planAfter(input, entry).sets[0]?.targetKg),
    reps: slot.repMin,
  };
}

function linearMessage(input: TargetMessageInput): TargetMessage {
  const { slot, entry } = input;
  const sets = workSets(entry);
  if (sets.length === 0 || sets.some((s) => s.reps === null)) {
    return {
      mode: 'linear',
      kind: 'pending',
      sets: slot.sets,
      reps: formatRepTarget(slot.repMin, slot.repMax),
      kg: positiveKg(currentTargetKg(input)),
    };
  }
  const next = planAfter(input, entry);
  if (next.info.mode !== 'linear' || next.info.lastOutcome === null) return { mode: 'free' };
  return {
    mode: 'linear',
    kind: next.info.lastOutcome,
    kg: positiveKg(next.sets[0]?.targetKg),
  };
}

/**
 * What a slot asks for in the current session and what follows, as data: the screen
 * writes the text. Without automatic progression (free slot, unreadable weeks or an entry
 * that is not the slot's own) the message is `free`. Weights are not rounded.
 */
export function targetMessage(input: TargetMessageInput): TargetMessage {
  const { slot, entry } = input;
  if (entry.replacesSlotUid !== null || entry.slotUid !== slot.uid) return { mode: 'free' };
  switch (slot.mode) {
    case 'range':
      return rangeMessage(input);
    case 'linear':
      return linearMessage(input);
    case 'wave':
    case 'free':
      return { mode: 'free' };
  }
}
