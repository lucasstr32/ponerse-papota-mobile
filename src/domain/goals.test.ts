import { assert, array, integer, property, tuple } from 'fast-check';

import { makeSet, sessionOfSets } from './builders.fixtures';
import { goalProgress } from './goals';
import type { SessionRecord, StrengthGoal } from './types';

const day = (n: number): string => new Date(Date.UTC(2026, 0, n)).toISOString();

const goal: StrengthGoal = { exerciseId: 'ex1', kg: 84, reps: 3 };

const first = sessionOfSets('first', day(1), 'ex1', [makeSet({ kg: 80, reps: 1 })]);
const second = sessionOfSets('second', day(8), 'ex1', [makeSet({ kg: 86, reps: 1 })]);

describe('goalProgress', () => {
  it('measures the way from the first 1RM to the target', () => {
    const result = goalProgress(goal, [first, second]);
    expect(result.targetOneRm).toBeCloseTo(92.4, 6);
    expect(result.start).toBe(80);
    expect(result.current).toBe(86);
    expect(result.progress).toBeCloseTo(6 / 12.4, 6);
    expect(result.achievedSessionId).toBeNull();
  });

  it('reaches 100% and names the session once the goal set is lifted', () => {
    const lift = sessionOfSets('lift', day(15), 'ex1', [makeSet({ kg: 85, reps: 3 })]);
    const result = goalProgress(goal, [first, second, lift]);
    expect(result.progress).toBe(1);
    expect(result.achievedSessionId).toBe('lift');
  });

  it('has no start, current or progress without sessions', () => {
    expect(goalProgress(goal, [])).toEqual({
      targetOneRm: expect.closeTo(92.4, 6),
      start: null,
      current: null,
      progress: 0,
      achievedSessionId: null,
    });
  });

  it('is complete when the start already reaches the target', () => {
    const strong = sessionOfSets('strong', day(1), 'ex1', [makeSet({ kg: 95, reps: 1 })]);
    const result = goalProgress(goal, [strong]);
    expect(result.progress).toBe(1);
    expect(result.achievedSessionId).toBeNull();
  });

  it('takes the start from the first session with an eligible set', () => {
    const light = sessionOfSets('light', day(0), 'ex1', [makeSet({ kg: 30, reps: 15 })]);
    const result = goalProgress(goal, [light, second, first]);
    expect(result.start).toBe(80);
  });

  it('names the oldest session even when sessions arrive out of order', () => {
    const a = sessionOfSets('a', day(3), 'ex1', [makeSet({ kg: 90, reps: 3 })]);
    const b = sessionOfSets('b', day(2), 'ex1', [makeSet({ kg: 90, reps: 3 })]);
    expect(goalProgress(goal, [a, b]).achievedSessionId).toBe('b');
  });

  it('does not count approach sets, sets without a load or other exercises', () => {
    const sessions = [
      first,
      sessionOfSets('warm', day(2), 'ex1', [makeSet({ type: 'warmup', kg: 90, reps: 5 })]),
      sessionOfSets('bare', day(3), 'ex1', [makeSet({ kg: null, reps: 20 })]),
      sessionOfSets('other', day(4), 'ex2', [makeSet({ kg: 120, reps: 5 })]),
    ];
    const result = goalProgress(goal, sessions);
    expect(result.achievedSessionId).toBeNull();
    expect(result.current).toBe(80);
  });

  it('only a set with the load and reps of the goal fixes the achievement', () => {
    const heavy = sessionOfSets('heavy', day(2), 'ex1', [makeSet({ kg: 95, reps: 1 })]);
    const result = goalProgress(goal, [first, heavy]);
    expect(result.progress).toBe(1);
    expect(result.achievedSessionId).toBeNull();
  });

  it('does not date the achievement from a set without a load, even for a goal of 0 kg', () => {
    const bodyweight: StrengthGoal = { exerciseId: 'ex1', kg: 0, reps: 3 };
    const bare = sessionOfSets('bare', day(1), 'ex1', [makeSet({ kg: null, reps: 5 })]);
    expect(goalProgress(bodyweight, [bare]).achievedSessionId).toBeNull();
  });

  it('dates the achievement from a set above the goal reps even if it gives no 1RM', () => {
    const endurance: StrengthGoal = { exerciseId: 'ex1', kg: 50, reps: 12 };
    const start = sessionOfSets('start', day(1), 'ex1', [makeSet({ kg: 40, reps: 1 })]);
    const long = sessionOfSets('long', day(2), 'ex1', [makeSet({ kg: 50, reps: 13 })]);
    const result = goalProgress(endurance, [start, long]);
    expect(result.progress).toBe(1);
    expect(result.achievedSessionId).toBe('long');
  });

  it('counts a failed set that has the load and reps', () => {
    const failed = sessionOfSets('f', day(2), 'ex1', [makeSet({ kg: 84, reps: 3, failed: true })]);
    expect(goalProgress(goal, [first, failed]).achievedSessionId).toBe('f');
  });
});

const sessionsArb = array(
  array(tuple(integer({ min: 1, max: 150 }), integer({ min: 1, max: 15 })), {
    minLength: 1,
    maxLength: 4,
  }),
  { maxLength: 6 },
).map((all): SessionRecord[] =>
  all.map((sets, i) =>
    sessionOfSets(
      `s${i}`,
      day(i + 1),
      'ex1',
      sets.map(([kg, reps]) => makeSet({ kg, reps })),
    ),
  ),
);

const goalArb = tuple(integer({ min: 1, max: 150 }), integer({ min: 1, max: 12 })).map(
  ([kg, reps]): StrengthGoal => ({ exerciseId: 'ex1', kg, reps }),
);

describe('goalProgress properties', () => {
  it('keeps the progress between 0 and 1', () => {
    assert(
      property(goalArb, sessionsArb, (g, sessions) => {
        const { progress } = goalProgress(g, sessions);
        expect(progress).toBeGreaterThanOrEqual(0);
        expect(progress).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('never loses progress when a later session is added', () => {
    assert(
      property(
        goalArb,
        sessionsArb,
        tuple(integer({ min: 1, max: 150 }), integer({ min: 1, max: 15 })),
        (g, sessions, [kg, reps]) => {
          const later = sessionOfSets('later', day(40), 'ex1', [makeSet({ kg, reps })]);
          expect(goalProgress(g, [...sessions, later]).progress).toBeGreaterThanOrEqual(
            goalProgress(g, sessions).progress,
          );
        },
      ),
    );
  });

  it('is complete whenever the achievement is dated', () => {
    assert(
      property(goalArb, sessionsArb, (g, sessions) => {
        const result = goalProgress(g, sessions);
        if (result.achievedSessionId !== null) expect(result.progress).toBe(1);
      }),
    );
  });

  it('does not depend on the order of the sessions', () => {
    assert(
      property(goalArb, sessionsArb, (g, sessions) => {
        expect(goalProgress(g, [...sessions].reverse())).toEqual(goalProgress(g, sessions));
      }),
    );
  });
});
