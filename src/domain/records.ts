import { exerciseSets } from './history';
import { epley } from './math';
import type { ExerciseInfo, SessionRecord, SetRecord } from './types';

/** Reps above this make the Epley estimate unreliable, so no 1RM is taken from them. */
const MAX_ESTIMATE_REPS = 12;

/** Margin a set needs over the previous best estimate to count as a record. */
const RECORD_MARGIN = 0.01;

/** Estimated 1RM of a set (Epley), or null without a load or outside 1 to 12 reps. */
export function oneRmOf(set: Pick<SetRecord, 'kg' | 'reps'>): number | null {
  const { kg, reps } = set;
  if (kg === null || kg <= 0 || reps === null || reps < 1 || reps > MAX_ESTIMATE_REPS) return null;
  return epley(kg, reps);
}

/**
 * 1RM implied by a control set, taken to failure: the set plus one more rep.
 * Null without a load or when that extra rep leaves the 1 to 12 range.
 */
export function controlOneRm(set: Pick<SetRecord, 'kg' | 'reps'>): number | null {
  const { kg, reps } = set;
  if (kg === null || kg <= 0 || reps === null || reps < 1 || reps + 1 > MAX_ESTIMATE_REPS)
    return null;
  return epley(kg, reps + 1);
}

export interface RecordSet {
  sessionId: string;
  /** Load of the set; zero when none was entered. */
  kg: number;
  reps: number;
}

export interface OneRmRecord extends RecordSet {
  oneRm: number;
}

export interface PersonalRecords {
  weight: RecordSet | null;
  oneRm: OneRmRecord | null;
  reps: RecordSet | null;
}

/**
 * Personal records of an exercise: heaviest weight (more reps break ties), best estimated
 * 1RM and most reps (more weight breaks ties). An exact tie keeps the oldest set.
 */
export function personalRecords(
  sessions: readonly SessionRecord[],
  exerciseId: string,
  excludeSessionId: string | null = null,
): PersonalRecords {
  let weight: RecordSet | null = null;
  let oneRm: OneRmRecord | null = null;
  let reps: RecordSet | null = null;
  for (const { sessionId, set } of exerciseSets(sessions, exerciseId, excludeSessionId)) {
    const setReps = set.reps ?? 0;
    const kg = set.kg ?? 0;
    const candidate: RecordSet = { sessionId, kg, reps: setReps };
    if (
      kg > 0 &&
      (weight === null || kg > weight.kg || (kg === weight.kg && setReps > weight.reps))
    )
      weight = candidate;
    const estimate = oneRmOf(set);
    if (estimate !== null && (oneRm === null || estimate > oneRm.oneRm))
      oneRm = { ...candidate, oneRm: estimate };
    if (reps === null || setReps > reps.reps || (setReps === reps.reps && kg > reps.kg))
      reps = candidate;
  }
  return { weight, oneRm, reps };
}

/**
 * True when a set beats the records set before the current session. Warm-ups never count,
 * and without a previous record there is nothing to beat. Exercises not measured in reps,
 * and bodyweight work without added load, compare reps; the rest compare the estimated 1RM.
 */
export function isPersonalRecord(
  set: SetRecord,
  records: PersonalRecords,
  exercise: ExerciseInfo,
): boolean {
  if (set.type === 'warmup' || set.reps === null || set.reps <= 0) return false;
  const byReps = exercise.unit !== 'reps' || (exercise.bodyweight && (set.kg ?? 0) <= 0);
  if (byReps) return records.reps !== null && set.reps > records.reps.reps;
  const estimate = oneRmOf(set);
  if (estimate === null || records.oneRm === null) return false;
  // Rounded so that a gap of exactly one cent is not read as more than a cent.
  return Math.round((estimate - records.oneRm.oneRm) * 1e6) > RECORD_MARGIN * 1e6;
}
