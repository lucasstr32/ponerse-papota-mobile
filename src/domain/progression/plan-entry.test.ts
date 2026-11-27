import { makeAdjustment, makeExercise, makeSlot, sessionWith } from '../builders.fixtures';
import { planEntry } from './plan-entry';

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
