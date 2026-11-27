export type Equipment =
  'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'other';

export type MeasureUnit = 'reps' | 'seconds' | 'meters';

export type ProgressionMode = 'range' | 'linear' | 'wave' | 'free';

export type WarmupLevel = 'none' | 'one' | 'full';

export type SetType = 'warmup' | 'work' | 'control';

export interface ExerciseInfo {
  id: string;
  equipment: Equipment;
  increment: number;
  unit: MeasureUnit;
  bodyweight: boolean;
  fromFloor: boolean;
}

export interface SlotConfig {
  uid: string;
  exerciseId: string;
  mode: ProgressionMode;
  sets: number;
  repMin: number;
  repMax: number;
  kg: number | null;
  increment: number | null;
  warmup: WarmupLevel;
  weeks: string;
  offsetKg: number;
  resetAt: string | null;
}

export interface SetRecord {
  type: SetType;
  targetKg: number | null;
  targetReps: string;
  kg: number | null;
  reps: number | null;
  rir: number | null;
  done: boolean;
  failed: boolean;
}

export interface EntryRecord {
  slotUid: string | null;
  replacesSlotUid: string | null;
  exerciseId: string;
  sets: SetRecord[];
}

export interface SessionRecord {
  id: string;
  createdAt: string;
  entries: EntryRecord[];
}

export interface PlannedSet {
  type: SetType;
  targetKg: number | null;
  targetReps: string;
}

export type AdjustmentRule = 'up' | 'hold' | 'down';

/** A load adjustment recorded for one slot in one session. */
export interface AdjustmentLog {
  slotUid: string;
  sessionId: string;
  rule: AdjustmentRule;
  offsetBefore: number;
  offsetAfter: number;
  accepted: boolean;
}

export type AdjustmentReason = 'extraReserve' | 'rirZero' | 'missedReps' | 'missedTwice';

interface ProposalOffsets {
  offsetBefore: number;
  offsetAfter: number;
}

/**
 * A load adjustment on offer. The reason depends on the rule; a hold leaves the offset
 * unchanged (`offsetAfter === offsetBefore`).
 */
export type AdjustmentProposal =
  | ({ rule: 'up'; reason: 'extraReserve' } & ProposalOffsets)
  | ({ rule: 'hold'; reason: 'rirZero' | 'missedReps' } & ProposalOffsets)
  | ({ rule: 'down'; reason: 'missedTwice' } & ProposalOffsets);

/** The block week a session falls in: its reserve target and whether it is a deload. */
export interface BlockWeek {
  rir: string;
  deload: boolean;
}

export type LinearOutcome = 'achieved' | 'firstFail' | 'deload';

export type EngineInfo =
  | { mode: 'range' }
  | { mode: 'linear'; fails: number; lastOutcome: LinearOutcome | null }
  | {
      mode: 'wave';
      cycle: number;
      week: number;
      weeksCount: number;
      deload: boolean;
      invalidWeeks: boolean;
    }
  | { mode: 'free' };
