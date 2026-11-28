import { assert, integer, property } from 'fast-check';

import {
  makeEntry,
  makeExercise,
  makeSession,
  makeSet,
  makeSlot,
  sessionWith,
} from '../builders.fixtures';
import { slotHistory } from '../history';
import type { ExerciseInfo, SessionRecord, SlotConfig } from '../types';
import { planRange } from './range';

const plan = (
  sessions: SessionRecord[],
  slotOverrides: Partial<SlotConfig> = {},
  exerciseOverrides: Partial<ExerciseInfo> = {},
): ReturnType<typeof planRange> => {
  const slot = makeSlot(slotOverrides);
  return planRange(slot, makeExercise(exerciseOverrides), slotHistory(sessions, slot));
};

const at = (n: number): string => `2026-01-0${n}T10:00:00.000Z`;

describe('planRange', () => {
  it('raises by the increment when every set reached the top', () => {
    const { sets } = plan([sessionWith('a', at(1), 40, [12, 12, 12])]);
    expect(sets).toHaveLength(3);
    expect(sets.every((s) => s.targetKg === 42.5 && s.targetReps === '10–12')).toBe(true);
    expect(sets.every((s) => s.type === 'work')).toBe(true);
  });

  it('snaps the raised target to two decimals', () => {
    const { sets } = plan([sessionWith('a', at(1), 0.1, [12, 12, 12])], { increment: 0.2 });
    expect(sets[0]?.targetKg).toBe(0.3);
  });

  it('uses the heaviest set when the weights vary within a session', () => {
    const session = makeSession({
      id: 'a',
      createdAt: at(1),
      entries: [
        makeEntry({
          sets: [40, 42.5, 40].map((kg) => makeSet({ kg, reps: 12 })),
        }),
      ],
    });
    expect(plan([session]).sets[0]?.targetKg).toBe(45);
  });

  it('counts a set without weight at its target', () => {
    const session = makeSession({
      id: 'a',
      createdAt: at(1),
      entries: [
        makeEntry({
          sets: [1, 2, 3].map(() =>
            makeSet({ targetKg: 42.5, targetReps: '10–12', kg: null, reps: 12 }),
          ),
        }),
      ],
    });
    expect(plan([session]).sets[0]?.targetKg).toBe(45);
  });

  it('ignores the target of a set without reps', () => {
    const session = makeSession({
      id: 'a',
      createdAt: at(1),
      entries: [
        makeEntry({
          sets: [
            ...[1, 2, 3].map(() => makeSet({ kg: 40, reps: 12 })),
            makeSet({ targetKg: 50, kg: null, reps: null }),
          ],
        }),
      ],
    });
    expect(plan([session]).sets[0]?.targetKg).toBe(42.5);
  });

  it('plans from the last session only, even if an older one reached the top', () => {
    const { sets } = plan([
      sessionWith('a', at(1), 40, [12, 12, 12]),
      sessionWith('b', at(2), 45, [12, 12, 10]),
    ]);
    expect(sets[0]?.targetKg).toBe(45);
  });

  it('keeps a zero added load on a bodyweight exercise at the top of the range', () => {
    const { sets } = plan(
      [sessionWith('a', at(1), 0, [12, 12, 12])],
      { kg: null },
      { bodyweight: true },
    );
    expect(sets.map((s) => s.targetKg)).toEqual([0, 0, 0]);
  });

  it('keeps the weight when a set fell short', () => {
    const { sets } = plan([sessionWith('a', at(1), 40, [12, 12, 11])]);
    expect(sets.map((s) => s.targetKg)).toEqual([40, 40, 40]);
  });

  it('never raises a bodyweight exercise', () => {
    const { sets } = plan(
      [sessionWith('a', at(1), null, [10, 10, 10, 10])],
      { sets: 4, repMin: 6, repMax: 10, kg: null },
      { bodyweight: true, equipment: 'bodyweight' },
    );
    expect(sets).toHaveLength(4);
    expect(sets.every((s) => s.targetKg === null && s.targetReps === '6–10')).toBe(true);
  });

  it('raises the added load of a bodyweight exercise', () => {
    const { sets } = plan(
      [sessionWith('a', at(1), 10, [10, 10, 10])],
      { repMin: 6, repMax: 10, kg: null },
      { bodyweight: true },
    );
    expect(sets.map((s) => s.targetKg)).toEqual([12.5, 12.5, 12.5]);
  });

  it('starts from the slot weight without history', () => {
    const { sets, info } = plan([], { kg: 35 });
    expect(sets.map((s) => s.targetKg)).toEqual([35, 35, 35]);
    expect(info).toEqual({ mode: 'range' });
  });

  it('does not raise with a zero increment', () => {
    const { sets } = plan([sessionWith('a', at(1), 40, [12, 12, 12])], {}, { increment: 0 });
    expect(sets[0]?.targetKg).toBe(40);
  });

  it('does not raise with fewer logged sets than planned', () => {
    const { sets } = plan([sessionWith('a', at(1), 40, [12, 12])]);
    expect(sets[0]?.targetKg).toBe(40);
  });

  it('does not raise when the weight was not recorded', () => {
    const { sets } = plan([sessionWith('a', at(1), null, [12, 12, 12])], { kg: 40 });
    expect(sets[0]?.targetKg).toBe(40);
  });

  it('prefers the slot increment over the exercise one', () => {
    const { sets } = plan([sessionWith('a', at(1), 40, [12, 12, 12])], { increment: 1 });
    expect(sets[0]?.targetKg).toBe(41);
  });

  it('uses the heaviest set of the last session and the current top of the range', () => {
    const { sets } = plan([sessionWith('a', at(1), 40, [12, 12, 12])], { repMax: 12, repMin: 8 });
    expect(sets[0]?.targetReps).toBe('8–12');
    expect(sets[0]?.targetKg).toBe(42.5);
  });

  it('writes a single number when the range is one value', () => {
    const { sets } = plan([], { repMin: 8, repMax: 8 });
    expect(sets[0]?.targetReps).toBe('8');
  });

  it('only moves the target by zero or the increment', () => {
    assert(
      property(
        integer({ min: 0, max: 200 }),
        integer({ min: 0, max: 14 }),
        integer({ min: 0, max: 14 }),
        (kg, a, b) => {
          const { sets } = plan([sessionWith('a', at(1), kg, [a, b, 12])], { repMax: 12 });
          const diff = (sets[0]?.targetKg ?? NaN) - kg;
          expect([0, 2.5]).toContain(diff);
        },
      ),
    );
  });

  it('keeps an unloaded bodyweight target flat', () => {
    assert(
      property(integer({ min: 0, max: 30 }), (reps) => {
        const { sets } = plan(
          [sessionWith('a', at(1), null, [reps, reps, reps])],
          { kg: null },
          { bodyweight: true },
        );
        expect(sets[0]?.targetKg).toBeNull();
      }),
    );
  });
});
