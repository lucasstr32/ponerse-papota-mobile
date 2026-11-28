import { array, assert, integer, nat, property } from 'fast-check';

import {
  makeAdjustment,
  makeEntry,
  makeExercise,
  makeSet,
  makeSlot,
  sessionWith,
  workSetsOf,
} from './builders.fixtures';
import { snapKg } from './math';
import { planAfter } from './progression/plan-entry';
import { heaviest } from './progression/range';
import { targetMessage } from './target-message';
import type { TargetMessage, TargetMessageInput } from './target-message';

const day = (i: number) => `2026-01-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`;
const current = { id: 'now', createdAt: '2026-02-01T10:00:00.000Z' };
const exercise = makeExercise({ increment: 2.5 });

function input(overrides: Partial<TargetMessageInput> = {}): TargetMessageInput {
  return {
    slot: makeSlot({ mode: 'range' }),
    exercise,
    sessions: [],
    current,
    deload: false,
    adjustments: [],
    entry: makeEntry(),
    ...overrides,
  };
}

function entryOf(kg: number | null, reps: (number | null)[]) {
  return makeEntry({ sets: workSetsOf(kg, reps) });
}

function plannedSets(kg: number | null, reps: (number | null)[], failed = false) {
  return reps.map((r) =>
    makeSet({ targetKg: kg, targetReps: '5', kg, reps: r, failed: failed && r !== null }),
  );
}

function missingOf(message: TargetMessage): number {
  if (message.mode !== 'range') return -1;
  if (message.kind === 'progress') return message.missing;
  return message.kind === 'achieved' ? 0 : -1;
}

describe('targetMessage free', () => {
  it('is free for a free slot', () => {
    const slot = makeSlot({ mode: 'free' });
    expect(targetMessage(input({ slot }))).toEqual({ mode: 'free' });
  });

  it('is free for a wave with invalid weeks', () => {
    const slot = makeSlot({ mode: 'wave', weeks: 'nope' });
    expect(targetMessage(input({ slot }))).toEqual({ mode: 'free' });
  });

  it('is free for an entry that replaces the slot', () => {
    const entry = makeEntry({ replacesSlotUid: 'slot1', sets: workSetsOf(40, [12, 12, 12]) });
    expect(targetMessage(input({ entry }))).toEqual({ mode: 'free' });
  });

  it('is free for an entry of another slot', () => {
    const entry = makeEntry({ slotUid: 'other', sets: workSetsOf(40, [12, 12, 12]) });
    expect(targetMessage(input({ entry }))).toEqual({ mode: 'free' });
  });
});

describe('targetMessage double progression', () => {
  it('announces the raise when every set reaches the top of the range', () => {
    const entry = entryOf(40, [12, 12, 12]);
    expect(targetMessage(input({ entry }))).toEqual({
      mode: 'range',
      kind: 'achieved',
      kg: 42.5,
      reps: 10,
    });
  });

  it('counts the reps still missing', () => {
    const entry = entryOf(40, [12, 12, 11]);
    expect(targetMessage(input({ entry }))).toEqual({
      mode: 'range',
      kind: 'progress',
      sets: 3,
      reps: 12,
      kg: 40,
      missing: 1,
    });
  });

  describe('bodyweight without added load', () => {
    const pullups = makeExercise({ bodyweight: true, increment: 2.5 });
    const slot = makeSlot({ mode: 'range', sets: 4, repMin: 6, repMax: 10, kg: null });
    const sessions = [sessionWith('a', day(0), null, [10, 10, 10, 10])];
    const base = { exercise: pullups, slot, sessions };

    it('shows the goal with every rep missing for an empty session', () => {
      expect(targetMessage(input(base))).toEqual({
        mode: 'range',
        kind: 'progress',
        sets: 4,
        reps: 10,
        kg: null,
        missing: 40,
      });
    });

    it('suggests adding difficulty once the goal is met', () => {
      const entry = entryOf(null, [10, 10, 10, 10]);
      expect(targetMessage(input({ ...base, entry }))).toEqual({
        mode: 'range',
        kind: 'addDifficulty',
      });
    });

    it('also suggests it when the loaded weight is zero', () => {
      const entry = entryOf(0, [10, 10, 10, 10]);
      expect(targetMessage(input({ ...base, entry })).mode).toBe('range');
      expect(targetMessage(input({ ...base, entry }))).toEqual({
        mode: 'range',
        kind: 'addDifficulty',
      });
    });

    it('raises the added load when there is one', () => {
      const entry = entryOf(10, [10, 10, 10, 10]);
      expect(targetMessage(input({ ...base, entry }))).toEqual({
        mode: 'range',
        kind: 'achieved',
        kg: 12.5,
        reps: 6,
      });
    });
  });

  describe('progress in quality', () => {
    const fixed = makeSlot({ mode: 'range', repMin: 8, repMax: 8, increment: 0 });

    it('applies with a fixed rep target and no increment', () => {
      expect(targetMessage(input({ slot: fixed }))).toEqual({
        mode: 'range',
        kind: 'quality',
      });
      const entry = entryOf(40, [8, 8, 8]);
      expect(targetMessage(input({ slot: fixed, entry })).mode).toBe('range');
      expect(targetMessage(input({ slot: fixed, entry }))).toEqual({
        mode: 'range',
        kind: 'quality',
      });
    });

    it('applies to bodyweight work with an empty session', () => {
      const pullups = makeExercise({ bodyweight: true });
      expect(targetMessage(input({ slot: fixed, exercise: pullups }))).toEqual({
        mode: 'range',
        kind: 'quality',
      });
    });

    it('keeps the same weight when the range is open and there is no increment', () => {
      const open = makeSlot({ mode: 'range', increment: 0 });
      const entry = entryOf(40, [12, 12, 12]);
      expect(targetMessage(input({ slot: open, entry }))).toEqual({
        mode: 'range',
        kind: 'achieved',
        kg: 40,
        reps: 10,
      });
    });
  });

  describe('current weight', () => {
    const sessions = [sessionWith('a', day(0), 40, [12, 12, 12])];

    it('prefers the loaded weight over the target', () => {
      const entry = entryOf(45, [10]);
      const message = targetMessage(input({ sessions, entry }));
      expect(message).toMatchObject({ kind: 'progress', kg: 45 });
    });

    it('uses the target when no weight is loaded', () => {
      const entry = entryOf(null, [10]);
      const message = targetMessage(input({ sessions, entry }));
      expect(message).toMatchObject({ kind: 'progress', kg: 42.5 });
    });

    it('omits a non-positive weight', () => {
      const slot = makeSlot({ mode: 'range', kg: 0 });
      expect(targetMessage(input({ slot }))).toMatchObject({ kind: 'progress', kg: null });
    });
  });

  describe('missing reps', () => {
    it('adds a set below the top beyond the planned ones', () => {
      expect(targetMessage(input({ entry: entryOf(40, [12, 12, 12, 9]) }))).toMatchObject({
        kind: 'progress',
        missing: 3,
      });
    });

    it('counts a whole set as missing for each one not loaded', () => {
      expect(targetMessage(input({ entry: entryOf(40, [12, null, 12]) }))).toMatchObject({
        kind: 'progress',
        missing: 12,
      });
    });

    it('is the planned sets times the top for an entry without sets', () => {
      expect(targetMessage(input())).toMatchObject({ kind: 'progress', missing: 36 });
    });
  });

  describe('properties', () => {
    const repsList = array(nat({ max: 16 }), { minLength: 0, maxLength: 6 });
    const halfKg = integer({ min: 2, max: 400 }).map((x) => x / 2);

    function slotOf(sets: number, repMax: number) {
      return makeSlot({ mode: 'range', sets, repMin: 5, repMax, kg: 40 });
    }

    it('reaches the goal exactly when the raise is announced', () => {
      assert(
        property(
          integer({ min: 1, max: 5 }),
          integer({ min: 6, max: 12 }),
          halfKg,
          repsList,
          (sets, repMax, kg, reps) => {
            const slot = slotOf(sets, repMax);
            const entry = entryOf(kg, reps);
            const message = targetMessage(input({ slot, entry }));
            const done = reps.length >= sets && reps.every((r) => r >= repMax);
            expect(missingOf(message) >= 0).toBe(true);
            expect(message.mode === 'range' && message.kind === 'achieved').toBe(done);
            expect(missingOf(message) === 0).toBe(done);
            if (message.mode === 'range' && message.kind === 'achieved') {
              expect(message.kg).toBe(snapKg((heaviest(entry) ?? 0) + 2.5));
            }
          },
        ),
      );
    });

    it('never gets further from the goal when a set gains reps', () => {
      assert(
        property(
          integer({ min: 1, max: 5 }),
          integer({ min: 6, max: 12 }),
          halfKg,
          array(nat({ max: 16 }), { minLength: 1, maxLength: 6 }),
          nat({ max: 5 }),
          integer({ min: 1, max: 5 }),
          (sets, repMax, kg, reps, at, bump) => {
            const slot = slotOf(sets, repMax);
            const index = at % reps.length;
            const more = reps.map((r, i) => (i === index ? r + bump : r));
            const before = missingOf(targetMessage(input({ slot, entry: entryOf(kg, reps) })));
            const after = missingOf(targetMessage(input({ slot, entry: entryOf(kg, more) })));
            expect(after).toBeLessThanOrEqual(before);
          },
        ),
      );
    });

    it('does not depend on the order of the sessions', () => {
      assert(
        property(integer({ min: 0, max: 5 }), halfKg, repsList, (count, kg, reps) => {
          const sessions = Array.from({ length: count }, (_, i) =>
            sessionWith(`s${i}`, day(i), 40 + i, [12, 12, 11]),
          );
          const entry = entryOf(kg, reps);
          const forward = targetMessage(input({ sessions, entry }));
          const backward = targetMessage(input({ sessions: [...sessions].reverse(), entry }));
          expect(backward).toEqual(forward);
        }),
      );
    });
  });
});

describe('targetMessage linear', () => {
  const slot = makeSlot({ mode: 'linear', repMin: 5, repMax: 5, kg: 60 });
  const withEntry = (
    entry: ReturnType<typeof makeEntry>,
    extra: Partial<TargetMessageInput> = {},
  ) => targetMessage(input({ slot, entry, ...extra }));

  it('follows the outcome of three sessions in a row', () => {
    const first = makeEntry({ sets: plannedSets(60, [5, 5, 5]) });
    const second = makeEntry({ sets: plannedSets(62.5, [4, 4, 4]) });
    const third = makeEntry({ sets: plannedSets(62.5, [4, 4, 4]) });
    const s0 = { ...sessionWith('s0', day(0), 60, [5]), entries: [first] };
    const s1 = { ...sessionWith('s1', day(1), 62.5, [4]), entries: [second] };

    expect(withEntry(first)).toEqual({ mode: 'linear', kind: 'achieved', kg: 62.5 });
    expect(withEntry(second, { sessions: [s0] })).toEqual({
      mode: 'linear',
      kind: 'firstFail',
      kg: 62.5,
    });
    expect(withEntry(third, { sessions: [s0, s1] })).toEqual({
      mode: 'linear',
      kind: 'deload',
      kg: 57.5,
    });
  });

  describe('while sets are missing', () => {
    it('shows the goal for an empty session', () => {
      expect(withEntry(makeEntry())).toEqual({
        mode: 'linear',
        kind: 'pending',
        sets: 3,
        reps: '5',
        kg: 60,
      });
    });

    it('stays pending with a failed set and another without reps', () => {
      const entry = makeEntry({
        sets: [
          makeSet({ targetKg: 60, targetReps: '5', kg: 60, reps: 3, failed: true }),
          makeSet({ targetKg: 60, targetReps: '5' }),
        ],
      });
      expect(withEntry(entry)).toMatchObject({ kind: 'pending', kg: 60 });
    });

    it('has no weight when there is none anywhere', () => {
      const bare = makeSlot({ mode: 'linear', repMin: 5, repMax: 5, kg: null });
      expect(targetMessage(input({ slot: bare }))).toEqual({
        mode: 'linear',
        kind: 'pending',
        sets: 3,
        reps: '5',
        kg: null,
      });
    });
  });

  it('reflects an accepted raise of the current session', () => {
    const entry = makeEntry({ sets: plannedSets(60, [5, 5, 5]) });
    const up = makeAdjustment({ sessionId: 'now', rule: 'up', offsetBefore: 0, offsetAfter: 2.5 });
    expect(withEntry(entry, { adjustments: [up] })).toEqual({
      mode: 'linear',
      kind: 'achieved',
      kg: 65,
    });
  });

  it('matches the outcome of the next plan once every set has reps', () => {
    const history = array(array(nat({ max: 7 }), { minLength: 1, maxLength: 4 }), { maxLength: 4 });
    assert(
      property(history, array(nat({ max: 7 }), { minLength: 1, maxLength: 4 }), (past, reps) => {
        const sessions = past.map((r, i) => ({
          ...sessionWith(`s${i}`, day(i), 60, [5]),
          entries: [makeEntry({ sets: plannedSets(60, r) })],
        }));
        const entry = makeEntry({ sets: plannedSets(60, reps) });
        const message = withEntry(entry, { sessions });
        const info = planAfter({ ...input({ slot, sessions }) }, entry).info;
        expect(message.mode === 'linear' && message.kind).toBe(
          info.mode === 'linear' ? info.lastOutcome : null,
        );
      }),
    );
  });
});
