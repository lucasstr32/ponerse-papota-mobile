import { exerciseSets } from './history';
import { epley } from './math';
import { oneRmOf, personalRecords } from './records';
import type { SessionRecord, StrengthGoal } from './types';

export interface GoalProgress {
  /** 1RM equivalent to the goal (not capped: the goal editor bounds the inputs). */
  targetOneRm: number;
  /** Best 1RM of the first session that has an eligible set. */
  start: number | null;
  /** Best 1RM so far. */
  current: number | null;
  /** Fraction of the way from the start to the target, between 0 and 1. */
  progress: number;
  /** First session with a set at the goal's weight and reps, or null. */
  achievedSessionId: string | null;
}

/** Progress of a strength goal over the sessions of its exercise. */
export function goalProgress(goal: StrengthGoal, sessions: readonly SessionRecord[]): GoalProgress {
  const targetOneRm = epley(goal.kg, goal.reps);
  const sets = exerciseSets(sessions, goal.exerciseId);
  const firstEligible = sets.find(({ set }) => oneRmOf(set) !== null);
  const start =
    firstEligible === undefined
      ? null
      : Math.max(
          ...sets
            .filter(({ sessionId }) => sessionId === firstEligible.sessionId)
            .map(({ set }) => oneRmOf(set) ?? 0),
        );
  const current = personalRecords(sessions, goal.exerciseId).oneRm?.oneRm ?? null;
  const achieved = sets.find(
    ({ set }) => set.kg !== null && set.kg >= goal.kg && (set.reps ?? 0) >= goal.reps,
  );
  const achievedSessionId = achieved?.sessionId ?? null;

  let progress = 0;
  if (achievedSessionId !== null || (start !== null && start >= targetOneRm)) progress = 1;
  else if (start !== null && current !== null)
    progress = Math.min(1, Math.max(0, (current - start) / (targetOneRm - start)));
  return { targetOneRm, start, current, progress, achievedSessionId };
}
