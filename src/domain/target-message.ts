import { isMissedSet, waveIndex } from './adjustments';
import { loggedReps, slotTimeline, workSets } from './history';
import { planAfter, planEntry } from './progression/plan-entry';
import type { PlanEntryInput } from './progression/plan-entry';
import { heaviest } from './progression/range';
import { planWave } from './progression/wave';
import { controlOneRm } from './records';
import { formatRepTarget, repMax } from './reps';
import type { EntryRecord, LinearOutcome, PlannedSet, SetRecord } from './types';

/** Reps over the top of the target from which every set counts as extra margin. */
const EXTRA_MARGIN = 2;

export interface TargetSegment {
  sets: number;
  reps: string;
  kg: number | null;
}

export type WaveStatus =
  | { kind: 'controlPending'; kg: number | null }
  | { kind: 'controlDone'; kg: number; reps: number; oneRm: number | null }
  | { kind: 'controlDone'; kg: null; reps: number; oneRm: null }
  | { kind: 'pending'; remaining: number }
  | { kind: 'notCompleted' }
  | { kind: 'achieved' }
  | { kind: 'extraMargin' };

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
  | { mode: 'linear'; kind: LinearOutcome; kg: number | null }
  | {
      mode: 'wave';
      cycle: number;
      week: number;
      weeksCount: number;
      status: WaveStatus;
      next: { cycle: number; week: number; segments: TargetSegment[] };
    };

export interface TargetMessageInput extends PlanEntryInput {
  current: { id: string; createdAt: string };
  /** Live entry of the slot in the current session. */
  entry: EntryRecord;
}

/** A weight worth showing: zero, negative or missing weights give null. */
function positiveKg(kg: number | null | undefined): number | null {
  return kg === null || kg === undefined || kg <= 0 ? null : kg;
}

/** Target weight of the current session's work sets (range and linear plan them all alike). */
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
  // `planAfter` of a linear slot always reports an outcome, since the live entry is in its history.
  if (next.info.mode !== 'linear' || next.info.lastOutcome === null) return { mode: 'free' };
  return {
    mode: 'linear',
    kind: next.info.lastOutcome,
    kg: positiveKg(next.sets[0]?.targetKg),
  };
}

type LoadedSet = SetRecord & { kg: number; reps: number };

function isLoaded(set: SetRecord): set is LoadedSet {
  return set.kg !== null && set.reps !== null;
}

/** State of the control set: pending until every one has weight and reps, then the last one. */
function controlStatus(control: readonly SetRecord[]): WaveStatus {
  const loaded = control.filter(isLoaded);
  const last = loaded[loaded.length - 1];
  if (last === undefined || loaded.length < control.length) {
    return {
      kind: 'controlPending',
      // The `?.` only satisfies the types: an unloaded control set exists on this path.
      kg: positiveKg(control.find((s) => !isLoaded(s))?.targetKg),
    };
  }
  const kg = positiveKg(last.kg);
  if (kg === null) return { kind: 'controlDone', kg: null, reps: last.reps, oneRm: null };
  return { kind: 'controlDone', kg, reps: last.reps, oneRm: controlOneRm(last) };
}

/** State of a regular week: pending, then not completed, then extra margin, then achieved. */
function weekStatus(
  sets: readonly SetRecord[],
  plannedCount: number,
  slotRepMin: number,
): WaveStatus {
  if (sets.length === 0) return { kind: 'pending', remaining: plannedCount };
  const open = sets.filter((s) => s.reps === null).length;
  if (open > 0) return { kind: 'pending', remaining: open };
  if (sets.some((s) => isMissedSet(s, slotRepMin))) return { kind: 'notCompleted' };
  const margin = sets.every((s) => {
    const top = repMax(s.targetReps);
    return top !== null && s.reps !== null && s.reps >= top + EXTRA_MARGIN;
  });
  return { kind: margin ? 'extraMargin' : 'achieved' };
}

/** Consecutive planned sets with the same reps and weight, as segments. */
function segmentsOf(sets: readonly PlannedSet[]): TargetSegment[] {
  const segments: TargetSegment[] = [];
  let previous: PlannedSet | undefined;
  for (const set of sets) {
    const last = segments[segments.length - 1];
    if (
      last !== undefined &&
      previous !== undefined &&
      previous.targetReps === set.targetReps &&
      previous.targetKg === set.targetKg
    ) {
      last.sets += 1;
    } else {
      segments.push({ sets: 1, reps: set.targetReps, kg: positiveKg(set.targetKg) });
    }
    previous = set;
  }
  return segments;
}

function waveMessage(input: TargetMessageInput): TargetMessage {
  const { slot, exercise, sessions, current, deload, adjustments, entry } = input;
  const n = waveIndex(slot.uid, slotTimeline(sessions, slot, current), adjustments);
  const now = planWave(slot, exercise, n, { deload });
  const next = planAfter(input, entry);
  // `planAfter` of a wave slot always plans a wave; the check only narrows the type.
  if (now.info.invalidWeeks || next.info.mode !== 'wave') return { mode: 'free' };
  const control = entry.sets.filter((s) => s.type === 'control');
  const status =
    control.length > 0
      ? controlStatus(control)
      : weekStatus(workSets(entry), now.sets.length, slot.repMin);
  return {
    mode: 'wave',
    cycle: now.info.cycle,
    week: now.info.week,
    weeksCount: now.info.weeksCount,
    status,
    next: { cycle: next.info.cycle, week: next.info.week, segments: segmentsOf(next.sets) },
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
      return waveMessage(input);
    case 'free':
      return { mode: 'free' };
  }
}
