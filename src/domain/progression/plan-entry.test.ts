import { assert, integer, property } from 'fast-check';

import {
  makeAdjustment,
  makeEntry,
  makeExercise,
  makeSet,
  makeSlot,
  sessionWith,
  workSetsOf,
} from '../builders.fixtures';
import { planAfter, planEntry } from './plan-entry';
import { planWave } from './wave';

const exercise = makeExercise({ increment: 2.5 });
const sessions = [sessionWith('a', '2026-01-01T10:00:00.000Z', 40, [12, 12, 12])];
const current = { id: 'now', createdAt: '2026-01-05T10:00:00.000Z' };
const base = { exercise, sessions, current, deload: false, adjustments: [] };

describe('planEntry', () => {
  it('plans double progression from the slot history', () => {
    const { sets, info } = planEntry({ ...base, slot: makeSlot({ mode: 'range' }) });
    expect(sets).toHaveLength(3);
    expect(sets[0]).toEqual({ type: 'work', targetKg: 42.5, targetReps: '10–12' });
    expect(info).toEqual({ mode: 'range' });
  });

  it('plans from the target of a previous set that has reps but no weight', () => {
    const unweighed = makeEntry({
      sets: [1, 2, 3].map(() =>
        makeSet({ targetKg: 42.5, targetReps: '10–12', kg: null, reps: 12 }),
      ),
    });
    const previous = {
      ...sessionWith('a', '2026-01-01T10:00:00.000Z', 40, [12]),
      entries: [unweighed],
    };
    const slot = makeSlot({ mode: 'range', kg: 40 });
    const { sets } = planEntry({ ...base, slot, sessions: [previous] });
    expect(sets[0]?.targetKg).toBe(45);
  });

  it('plans a linear slot', () => {
    const slot = makeSlot({ mode: 'linear', repMin: 5, repMax: 5, kg: 60 });
    const { sets, info } = planEntry({ ...base, slot, sessions: [] });
    expect(sets[0]?.targetKg).toBe(60);
    expect(info.mode).toBe('linear');
  });

  it('plans a wave slot using the session count as n', () => {
    const slot = makeSlot({ mode: 'wave', weeks: '3x5@60\n3x5@65', increment: 5 });
    const { sets, info } = planEntry({ ...base, slot });
    expect(sets.map((s) => s.targetKg)).toEqual([65, 65, 65]);
    expect(info).toMatchObject({ mode: 'wave', week: 1, cycle: 0 });
  });

  it('passes the deload flag to the wave', () => {
    const slot = makeSlot({ mode: 'wave', weeks: '3x5@60\n3x5@50' });
    const { sets } = planEntry({ ...base, slot, sessions: [], deload: true });
    expect(sets[0]?.targetKg).toBe(50);
  });

  it('plans a free slot with the slot weight', () => {
    const slot = makeSlot({ mode: 'free', kg: 30, sets: 2, repMin: 8, repMax: 8 });
    const { sets, info } = planEntry({ ...base, slot });
    expect(sets).toEqual([
      { type: 'work', targetKg: 30, targetReps: '8' },
      { type: 'work', targetKg: 30, targetReps: '8' },
    ]);
    expect(info).toEqual({ mode: 'free' });
  });

  it('falls back to a free plan when the weeks are invalid', () => {
    const slot = makeSlot({ mode: 'wave', weeks: 'nope', kg: 30 });
    const { sets, info } = planEntry({ ...base, slot });
    expect(sets).toHaveLength(3);
    expect(sets.every((s) => s.type === 'work' && s.targetKg === 30)).toBe(true);
    expect(info).toMatchObject({ mode: 'wave', invalidWeeks: true });
  });

  it('puts warm-ups first, based on the heaviest work or control weight', () => {
    const slot = makeSlot({ mode: 'wave', weeks: '1xmáx@87.5 + 2x5@65', warmup: 'full' });
    const { sets } = planEntry({ ...base, slot, sessions: [] });
    const kinds = sets.map((s) => s.type);
    expect(kinds).toEqual(['warmup', 'warmup', 'warmup', 'warmup', 'control', 'work', 'work']);
    expect(sets[0]).toEqual({ type: 'warmup', targetKg: 20, targetReps: '10' });
  });

  it('has no warm-ups for a free slot without weight', () => {
    const slot = makeSlot({ mode: 'free', kg: null, warmup: 'full' });
    const { sets } = planEntry({ ...base, slot });
    expect(sets.every((s) => s.type === 'work')).toBe(true);
  });

  it('ignores sessions of other slots', () => {
    const other = [
      sessionWith('a', '2026-01-01T10:00:00.000Z', 40, [12, 12, 12], { slotUid: 'other' }),
    ];
    const slot = makeSlot({ mode: 'range', kg: 40 });
    expect(planEntry({ ...base, slot, sessions: other }).sets[0]?.targetKg).toBe(40);
  });

  describe('accepted adjustments', () => {
    const cycleWeeks = '4x6@60\n4x5@65\n5x3@70\n1xmáx@67.5 + 2x5@52.5';
    const day = (i: number) => `2026-01-0${i + 1}T10:00:00.000Z`;
    const week = (i: number, kg: number, reps: number[]) => sessionWith(`s${i}`, day(i), kg, reps);
    const failedWeeks = [
      week(0, 60, [6, 6, 6, 6]),
      week(1, 65, [5, 5, 5, 5]),
      week(2, 70, [3, 3, 2, 2, 2]),
      week(3, 70, [3, 2, 2, 2, 2]),
    ];
    const hold = makeAdjustment({ sessionId: 's2', rule: 'hold' });
    const down = makeAdjustment({ sessionId: 's3', rule: 'down', offsetAfter: -7.5 });

    it('repeats the week after an accepted hold', () => {
      const slot = makeSlot({ mode: 'wave', weeks: cycleWeeks, increment: 5 });
      const next = planEntry({
        ...base,
        slot,
        sessions: failedWeeks.slice(0, 3),
        adjustments: [hold],
      });
      expect(next.info).toMatchObject({ mode: 'wave', week: 2, cycle: 0 });
      expect(next.sets[0]?.targetKg).toBe(70);
    });

    it('repeats the failed week at the lowered weight after an accepted down', () => {
      const slot = makeSlot({ mode: 'wave', weeks: cycleWeeks, increment: 5, offsetKg: -7.5 });
      const next = planEntry({ ...base, slot, sessions: failedWeeks, adjustments: [hold, down] });
      expect(next.info).toMatchObject({ mode: 'wave', week: 2, cycle: 0 });
      expect(next.sets[0]?.targetKg).toBe(62.5);
    });

    it('repeats the week of the second cycle and keeps the cycle raise after a down', () => {
      const weeks = '3x5@60\n3x5@65';
      const slot = makeSlot({ mode: 'wave', weeks, increment: 5, offsetKg: -7.5 });
      const sessionsTwoCycles = [
        week(0, 60, [5, 5, 5]),
        week(1, 65, [5, 5, 5]),
        week(2, 65, [4, 4, 4]),
      ];
      const log = makeAdjustment({ sessionId: 's2', rule: 'down', offsetAfter: -7.5 });
      const next = planEntry({
        ...base,
        slot,
        sessions: sessionsTwoCycles,
        adjustments: [log],
      });
      expect(next.info).toMatchObject({ mode: 'wave', week: 0, cycle: 1 });
      expect(next.sets[0]?.targetKg).toBe(57.5);
    });

    it('ignores rejected logs and logs of other slots', () => {
      const slot = makeSlot({ mode: 'wave', weeks: cycleWeeks, increment: 5 });
      const rejected = makeAdjustment({ sessionId: 's2', rule: 'hold', accepted: false });
      const foreign = makeAdjustment({ sessionId: 's2', rule: 'hold', slotUid: 'other' });
      const next = planEntry({
        ...base,
        slot,
        sessions: failedWeeks.slice(0, 3),
        adjustments: [rejected, foreign],
      });
      expect(next.info).toMatchObject({ mode: 'wave', week: 3 });
    });

    it('adds an accepted raise once to a linear slot', () => {
      const slot = makeSlot({ mode: 'linear', repMin: 5, repMax: 5, kg: 60 });
      const done = [week(0, 60, [5, 5, 5])];
      const up = makeAdjustment({ sessionId: 's0', rule: 'up', offsetBefore: 0, offsetAfter: 2.5 });
      expect(planEntry({ ...base, slot, sessions: done }).sets[0]?.targetKg).toBe(62.5);
      expect(
        planEntry({ ...base, slot, sessions: done, adjustments: [up] }).sets[0]?.targetKg,
      ).toBe(65);
    });

    it('adds no raise to a linear slot when a hold is accepted in the same session', () => {
      const slot = makeSlot({ mode: 'linear', repMin: 5, repMax: 5, kg: 60 });
      const logs = [
        makeAdjustment({ sessionId: 's0', rule: 'up', offsetBefore: 0, offsetAfter: 2.5 }),
        makeAdjustment({ sessionId: 's0', rule: 'hold' }),
      ];
      const next = planEntry({
        ...base,
        slot,
        sessions: [week(0, 60, [5, 5, 5])],
        adjustments: logs,
      });
      expect(next.sets[0]?.targetKg).toBe(62.5);
    });

    it('ignores a rejected raise in a linear slot', () => {
      const slot = makeSlot({ mode: 'linear', repMin: 5, repMax: 5, kg: 60 });
      const up = makeAdjustment({ sessionId: 's0', rule: 'up', offsetAfter: 2.5, accepted: false });
      const next = planEntry({
        ...base,
        slot,
        sessions: [week(0, 60, [5, 5, 5])],
        adjustments: [up],
      });
      expect(next.sets[0]?.targetKg).toBe(62.5);
    });
  });
});

describe('planAfter', () => {
  const day = (i: number) => `2026-01-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`;
  const now = { id: 'now', createdAt: '2026-02-01T10:00:00.000Z' };
  const after = { exercise, current: now, deload: false, adjustments: [] };

  it('raises the double progression target when the live entry reaches the top', () => {
    const slot = makeSlot({ mode: 'range' });
    const history = [sessionWith('a', day(0), 40, [12, 12, 11])];
    const entry = makeEntry({ sets: workSetsOf(40, [12, 12, 12]) });
    const plan = planAfter({ ...after, slot, sessions: history }, entry);
    expect(plan.sets.map((s) => s.targetKg)).toEqual([42.5, 42.5, 42.5]);
  });

  it('keeps the weight when the live entry misses the top', () => {
    const slot = makeSlot({ mode: 'range' });
    const entry = makeEntry({ sets: workSetsOf(40, [12, 12, 11]) });
    expect(planAfter({ ...after, slot, sessions: [] }, entry).sets[0]?.targetKg).toBe(40);
  });

  it('follows the linear sequence of achieved, first fail and deload', () => {
    const slot = makeSlot({ mode: 'linear', repMin: 5, repMax: 5, kg: 60 });
    const sets = (kg: number, reps: number) =>
      [reps, reps, reps].map(() => makeSet({ targetKg: kg, targetReps: '5', kg, reps }));
    const first = makeEntry({ sets: sets(60, 5) });
    const second = makeEntry({ sets: sets(62.5, 4) });
    const third = makeEntry({ sets: sets(62.5, 4) });
    const s0 = { ...sessionWith('s0', day(0), 60, [5]), entries: [first] };
    const s1 = { ...sessionWith('s1', day(1), 62.5, [4]), entries: [second] };

    const a = planAfter({ ...after, slot, sessions: [] }, first);
    expect(a.info).toEqual({ mode: 'linear', fails: 0, lastOutcome: 'achieved' });
    expect(a.sets[0]?.targetKg).toBe(62.5);

    const b = planAfter({ ...after, slot, sessions: [s0] }, second);
    expect(b.info).toEqual({ mode: 'linear', fails: 1, lastOutcome: 'firstFail' });
    expect(b.sets[0]?.targetKg).toBe(62.5);

    const c = planAfter({ ...after, slot, sessions: [s0, s1] }, third);
    expect(c.info).toEqual({ mode: 'linear', fails: 0, lastOutcome: 'deload' });
    expect(c.sets[0]?.targetKg).toBe(57.5);
  });

  it('adds an accepted raise of the current session to a linear slot', () => {
    const slot = makeSlot({ mode: 'linear', repMin: 5, repMax: 5, kg: 60 });
    const entry = makeEntry({
      sets: [5, 5, 5].map((reps) => makeSet({ targetKg: 60, targetReps: '5', kg: 60, reps })),
    });
    const up = makeAdjustment({ sessionId: 'now', rule: 'up', offsetBefore: 0, offsetAfter: 2.5 });
    const plan = planAfter({ ...after, slot, sessions: [], adjustments: [up] }, entry);
    expect(plan.sets[0]?.targetKg).toBe(65);
  });

  describe('weekly wave', () => {
    const slot = makeSlot({ mode: 'wave', weeks: '3x5@60\n3x5@65', increment: 5 });

    it('advances one week even when the live entry is empty', () => {
      const plan = planAfter({ ...after, slot, sessions: [] }, makeEntry());
      expect(plan.info).toMatchObject({ mode: 'wave', week: 1, cycle: 0 });
      expect(plan.sets.map((s) => s.targetKg)).toEqual([65, 65, 65]);
    });

    it('never plans a deload week next', () => {
      const plan = planAfter({ ...after, slot, sessions: [], deload: true }, makeEntry());
      expect(plan.info).toMatchObject({ week: 1, deload: false });
    });

    it('repeats the week after an accepted hold for the current session', () => {
      const hold = makeAdjustment({ sessionId: 'now', rule: 'hold' });
      const entry = makeEntry({ sets: workSetsOf(60, [5, 5, 5]) });
      const plan = planAfter({ ...after, slot, sessions: [], adjustments: [hold] }, entry);
      expect(plan.info).toMatchObject({ week: 0, cycle: 0 });
    });

    it('moves to the next cycle after the last week', () => {
      const history = [sessionWith('a', day(0), 60, [5, 5, 5])];
      const plan = planAfter({ ...after, slot, sessions: history }, makeEntry());
      expect(plan.info).toMatchObject({ week: 0, cycle: 1 });
      expect(plan.sets[0]?.targetKg).toBe(65);
    });

    it('falls back to free sets when the weeks are invalid', () => {
      const bad = makeSlot({ mode: 'wave', weeks: 'nope', kg: 30 });
      const plan = planAfter({ ...after, slot: bad, sessions: [] }, makeEntry());
      expect(plan.info).toMatchObject({ mode: 'wave', invalidWeeks: true });
      expect(plan.sets.every((s) => s.targetKg === 30)).toBe(true);
    });
  });

  it('adds no warm-ups', () => {
    const full = makeSlot({ mode: 'wave', weeks: '3x5@60\n3x5@65', warmup: 'full' });
    const plan = planAfter({ ...after, slot: full, sessions: [] }, makeEntry());
    expect(plan.sets.every((s) => s.type !== 'warmup')).toBe(true);
    expect(plan.sets).toHaveLength(3);
  });

  it('plans the week that follows even if a saved copy of the current session exists', () => {
    const slot = makeSlot({ mode: 'wave', weeks: '3x5@60\n3x5@65\n3x5@70' });
    const saved = sessionWith('now', day(0), 60, [5, 5, 5]);
    const plan = planAfter({ ...after, slot, sessions: [saved] }, makeEntry());
    expect(plan.info).toMatchObject({ mode: 'wave', cycle: 0, week: 1 });
  });

  it('leaves out another session created at the same time as the current one', () => {
    const slot = makeSlot({ mode: 'wave', weeks: '3x5@60\n3x5@65\n3x5@70' });
    const twin = sessionWith('twin', now.createdAt, 60, [5, 5, 5]);
    const plan = planAfter({ ...after, slot, sessions: [twin] }, makeEntry());
    expect(plan.info).toMatchObject({ mode: 'wave', cycle: 0, week: 1 });
  });

  it('plans a free slot with the slot weight', () => {
    const slot = makeSlot({ mode: 'free', kg: 30 });
    const plan = planAfter({ ...after, slot, sessions: [] }, makeEntry());
    expect(plan.info).toEqual({ mode: 'free' });
    expect(plan.sets.map((s) => s.targetKg)).toEqual([30, 30, 30]);
  });

  it('matches the wave planned for the following session', () => {
    assert(
      property(integer({ min: 1, max: 4 }), integer({ min: 0, max: 8 }), (length, done) => {
        const weeks = Array.from({ length }, (_, i) => `3x5@${60 + 5 * i}`).join('\n');
        const slot = makeSlot({ mode: 'wave', weeks, increment: 2.5 });
        const history = Array.from({ length: done }, (_, i) =>
          sessionWith(`s${i}`, day(i), 60, [5, 5, 5]),
        );
        const plan = planAfter({ ...after, slot, sessions: history }, makeEntry());
        expect(plan.info).toEqual(planWave(slot, exercise, done + 1, { deload: false }).info);
      }),
    );
  });
});
