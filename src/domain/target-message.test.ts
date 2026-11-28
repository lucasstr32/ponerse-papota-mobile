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

    it('counts a set without weight at its target', () => {
      const entry = makeEntry({
        sets: [12, 12, 12].map((reps) => makeSet({ targetKg: 42.5, kg: null, reps })),
      });
      expect(targetMessage(input({ entry }))).toEqual({
        mode: 'range',
        kind: 'achieved',
        kg: 45,
        reps: 10,
      });
    });

    it('raises a planned added load that was left empty', () => {
      const pullups = makeExercise({ bodyweight: true, increment: 2.5 });
      const slot = makeSlot({ mode: 'range', sets: 4, repMin: 6, repMax: 10, kg: null });
      const entry = makeEntry({
        sets: [1, 2, 3, 4].map(() => makeSet({ targetKg: 10, kg: null, reps: 10 })),
      });
      expect(targetMessage(input({ exercise: pullups, slot, entry }))).toEqual({
        mode: 'range',
        kind: 'achieved',
        kg: 12.5,
        reps: 6,
      });
    });

    it('still suggests adding difficulty for a zero target without weight', () => {
      const pullups = makeExercise({ bodyweight: true, increment: 2.5 });
      const slot = makeSlot({ mode: 'range', sets: 4, repMin: 6, repMax: 10, kg: null });
      const entry = makeEntry({
        sets: [1, 2, 3, 4].map(() => makeSet({ targetKg: 0, kg: null, reps: 10 })),
      });
      expect(targetMessage(input({ exercise: pullups, slot, entry }))).toEqual({
        mode: 'range',
        kind: 'addDifficulty',
      });
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

  it('follows an outcome model that does not use the planner', () => {
    const outcomeOf = (past: number[][], reps: number[]) => {
      const ok = (r: number[]) => r.every((x) => x >= 5);
      const fails = past.reduce((f, r) => (ok(r) ? 0 : f + 1 >= 2 ? 0 : f + 1), 0);
      return ok(reps) ? 'achieved' : fails + 1 >= 2 ? 'deload' : 'firstFail';
    };
    const kgOf = { achieved: 62.5, firstFail: 60, deload: 55 } as const;
    const history = array(array(nat({ max: 7 }), { minLength: 1, maxLength: 4 }), { maxLength: 4 });
    assert(
      property(history, array(nat({ max: 7 }), { minLength: 1, maxLength: 4 }), (past, reps) => {
        const sessions = past.map((r, i) => ({
          ...sessionWith(`s${i}`, day(i), 60, [5]),
          entries: [makeEntry({ sets: plannedSets(60, r) })],
        }));
        const kind = outcomeOf(past, reps);
        const message = withEntry(makeEntry({ sets: plannedSets(60, reps) }), { sessions });
        expect(message).toEqual({ mode: 'linear', kind, kg: kgOf[kind] });
      }),
    );
  });
});

describe('targetMessage weekly wave', () => {
  const cycleWeeks = '4x6@75\n4x5@80\n5x3@87.5\n1xmáx@87.5 + 2x5@65';
  const cycleSlot = makeSlot({ mode: 'wave', weeks: cycleWeeks, increment: 5 });
  const done = (count: number) =>
    Array.from({ length: count }, (_, i) => sessionWith(`s${i}`, day(i), 70, [5, 5, 5]));
  const controlWeek = (control: Parameters<typeof makeSet>[0]) =>
    makeEntry({
      sets: [
        makeSet({ type: 'control', targetKg: 87.5, targetReps: 'máx', ...control }),
        makeSet({ targetKg: 65, targetReps: '5' }),
        makeSet({ targetKg: 65, targetReps: '5' }),
      ],
    });
  const wave = (overrides: Partial<TargetMessageInput> = {}) =>
    targetMessage(input({ slot: cycleSlot, sessions: done(3), ...overrides }));

  describe('control week', () => {
    it('waits for the control set with the planned weight', () => {
      expect(wave({ entry: controlWeek({}) })).toEqual({
        mode: 'wave',
        cycle: 0,
        week: 3,
        weeksCount: 4,
        status: { kind: 'controlPending', kg: 87.5 },
        next: { cycle: 1, week: 0, segments: [{ sets: 4, reps: '6', kg: 80 }] },
      });
    });

    it('estimates the 1RM from the control set', () => {
      const message = wave({ entry: controlWeek({ kg: 87.5, reps: 7 }) });
      expect(message).toMatchObject({
        status: { kind: 'controlDone', kg: 87.5, reps: 7, oneRm: expect.closeTo(110.83, 2) },
        next: { cycle: 1, week: 0 },
      });
    });

    it('stays pending while the weight is empty even with reps', () => {
      const message = wave({ entry: controlWeek({ kg: null, reps: 7 }) });
      expect(message).toMatchObject({ status: { kind: 'controlPending', kg: 87.5 } });
    });

    it('has no estimate for a control of many reps', () => {
      const message = wave({ entry: controlWeek({ kg: 60, reps: 12 }) });
      expect(message).toMatchObject({
        status: { kind: 'controlDone', kg: 60, reps: 12, oneRm: null },
      });
    });

    it('uses the last control set', () => {
      const entry = makeEntry({
        sets: [
          makeSet({ type: 'control', kg: 80, reps: 5 }),
          makeSet({ type: 'control', kg: 87.5, reps: 7 }),
        ],
      });
      expect(wave({ entry })).toMatchObject({
        status: { kind: 'controlDone', kg: 87.5, reps: 7 },
      });
      const reversed = makeEntry({ sets: [...entry.sets].reverse() });
      expect(wave({ entry: reversed })).toMatchObject({
        status: { kind: 'controlDone', kg: 80, reps: 5 },
      });
    });

    it('does not let the lighter sets change the state', () => {
      const entry = controlWeek({ kg: 87.5, reps: 7 });
      const light = entry.sets.map((s) => (s.type === 'work' ? { ...s, failed: true } : s));
      expect(wave({ entry: { ...entry, sets: light } })).toMatchObject({
        status: { kind: 'controlDone' },
      });
    });

    it('omits the weight of a control target that is not positive', () => {
      const entry = controlWeek({ targetKg: null });
      expect(wave({ entry })).toMatchObject({ status: { kind: 'controlPending', kg: null } });
      for (const targetKg of [0, -5]) {
        expect(wave({ entry: controlWeek({ targetKg }) })).toMatchObject({
          status: { kind: 'controlPending', kg: null },
        });
      }
    });

    it('leaves out the weight and the estimate of a control that is not positive', () => {
      for (const kg of [0, -5]) {
        expect(wave({ entry: controlWeek({ kg, reps: 7 }) })).toMatchObject({
          status: { kind: 'controlDone', kg: null, reps: 7, oneRm: null },
        });
      }
    });

    it('stays pending for an empty control after a loaded one', () => {
      const entry = makeEntry({
        sets: [
          makeSet({ type: 'control', kg: 80, reps: 5 }),
          makeSet({ type: 'control', targetKg: 87.5 }),
        ],
      });
      expect(wave({ entry })).toMatchObject({ status: { kind: 'controlPending', kg: 87.5 } });
    });
  });

  describe('regular week', () => {
    const slot = makeSlot({ mode: 'wave', weeks: '3x5@60\n3x5@65', increment: 5 });
    const week = (reps: (number | null)[], failed = false) =>
      makeEntry({
        sets: reps.map((r) =>
          makeSet({ targetKg: 60, targetReps: '5', kg: 60, reps: r, failed: failed && r !== null }),
        ),
      });
    const status = (entry: ReturnType<typeof makeEntry>) => {
      const message = targetMessage(input({ slot, entry }));
      return message.mode === 'wave' ? message.status : null;
    };

    it('counts the sets still pending', () => {
      expect(status(week([5, null, null]))).toEqual({ kind: 'pending', remaining: 2 });
    });

    it('counts every planned set when the entry has none', () => {
      expect(status(makeEntry())).toEqual({ kind: 'pending', remaining: 3 });
    });

    it('is not completed under the minimum reps', () => {
      expect(status(week([5, 5, 4]))).toEqual({ kind: 'notCompleted' });
    });

    it('is not completed with a failed set', () => {
      expect(status(week([5, 5, 5], true))).toEqual({ kind: 'notCompleted' });
    });

    it('is achieved on target', () => {
      expect(status(week([5, 5, 5]))).toEqual({ kind: 'achieved' });
    });

    it('has extra margin when every set is two reps over', () => {
      expect(status(week([7, 8, 7]))).toEqual({ kind: 'extraMargin' });
    });

    it('is only achieved when one set is one rep over the margin', () => {
      expect(status(week([7, 7, 6]))).toEqual({ kind: 'achieved' });
    });

    it('adds no margin when the target reps are unreadable', () => {
      const entry = makeEntry({
        sets: [makeSet({ targetReps: '', kg: 60, reps: 30 })],
      });
      expect(status(entry)).toEqual({ kind: 'achieved' });
    });
  });

  it('shows the last week of the cycle as a deload and plans a regular next one', () => {
    const slot = makeSlot({ mode: 'wave', weeks: '3x5@60\n3x5@65', increment: 5 });
    const message = targetMessage(input({ slot, deload: true }));
    expect(message).toMatchObject({
      week: 1,
      next: { cycle: 0, week: 1, segments: [{ sets: 3, reps: '5', kg: 65 }] },
    });
  });

  it('plans the regular week that follows a deload in the middle of the cycle', () => {
    const slot = makeSlot({ mode: 'wave', weeks: '3x5@60\n3x5@65\n3x5@50', increment: 5 });
    const message = targetMessage(input({ slot, deload: true }));
    expect(message).toMatchObject({
      week: 2,
      next: { cycle: 0, week: 1, segments: [{ sets: 3, reps: '5', kg: 65 }] },
    });
  });

  it('groups equal consecutive sets of the next week into segments', () => {
    const slot = makeSlot({ mode: 'wave', weeks: `${cycleWeeks}\n${cycleWeeks}`, increment: 5 });
    const message = targetMessage(input({ slot, sessions: done(2) }));
    expect(message).toMatchObject({
      week: 2,
      next: {
        week: 3,
        segments: [
          { sets: 1, reps: 'máx', kg: 87.5 },
          { sets: 2, reps: '5', kg: 65 },
        ],
      },
    });
  });

  it('leaves the weight out of percentage segments', () => {
    const slot = makeSlot({ mode: 'wave', weeks: '3x5@70%\n2x3@80%' });
    const message = targetMessage(input({ slot }));
    expect(message).toMatchObject({
      next: {
        segments: [{ sets: 2, reps: '3', kg: null }],
      },
    });
  });

  it('includes the slot offset in the next week', () => {
    const slot = makeSlot({ mode: 'wave', weeks: '3x5@60\n3x5@65', offsetKg: 2.5 });
    expect(targetMessage(input({ slot }))).toMatchObject({
      next: { segments: [{ sets: 3, reps: '5', kg: 67.5 }] },
    });
  });

  it('does not advance the week after a hold of an earlier session', () => {
    const hold = makeAdjustment({ sessionId: 's1', rule: 'hold' });
    expect(wave({ sessions: done(2), adjustments: [hold] })).toMatchObject({
      week: 1,
      next: { week: 2 },
    });
  });

  describe('properties', () => {
    const lines = integer({ min: 1, max: 4 });
    const weeksOf = (length: number) =>
      Array.from({ length }, (_, i) => `3x5@${60 + 5 * i}`).join('\n');

    it('is pending exactly when a set has no reps', () => {
      assert(
        property(
          lines,
          array(
            nat({ max: 8 }).chain((r) => integer({ min: 0, max: 1 }).map((k) => (k ? null : r))),
            {
              minLength: 1,
              maxLength: 4,
            },
          ),
          (length, reps) => {
            const slot = makeSlot({ mode: 'wave', weeks: weeksOf(length) });
            const entry = makeEntry({
              sets: reps.map((r) => makeSet({ targetReps: '5', kg: 60, reps: r })),
            });
            const message = targetMessage(input({ slot, entry }));
            expect(message.mode === 'wave' && message.status.kind === 'pending').toBe(
              reps.some((r) => r === null),
            );
          },
        ),
      );
    });

    it('moves to the following week of the cycle without logs', () => {
      assert(
        property(lines, integer({ min: 0, max: 8 }), (length, count) => {
          const slot = makeSlot({ mode: 'wave', weeks: weeksOf(length) });
          const message = targetMessage(input({ slot, sessions: done(count) }));
          expect(message.mode === 'wave' && message.next.week).toBe((count + 1) % length);
        }),
      );
    });

    it('does not depend on the order of the sessions', () => {
      assert(
        property(lines, integer({ min: 0, max: 8 }), (length, count) => {
          const slot = makeSlot({ mode: 'wave', weeks: weeksOf(length) });
          const sessions = done(count);
          const forward = targetMessage(input({ slot, sessions }));
          const backward = targetMessage(input({ slot, sessions: [...sessions].reverse() }));
          expect(backward).toEqual(forward);
        }),
      );
    });
  });
});
