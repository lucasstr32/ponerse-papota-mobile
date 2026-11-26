import { assert, integer, property } from 'fast-check';

import { makeExercise, makeSlot, sessionWith } from '../builders.fixtures';
import { slotHistory } from '../history';
import { planWave } from './wave';

const weeks = '4x6@75\n4x5@80\n5x3@87.5\n1xmáx@87.5 + 2x5@65';
const slot = makeSlot({ mode: 'wave', weeks, increment: 5 });
const exercise = makeExercise({ increment: 2.5 });
const none = { deload: false };

describe('planWave', () => {
  it('walks weeks and adds the increment each cycle', () => {
    expect(planWave(slot, exercise, 0, none).sets).toEqual(
      Array.from({ length: 4 }, () => ({ type: 'work', targetKg: 75, targetReps: '6' })),
    );
    expect(planWave(slot, exercise, 3, none).sets).toEqual([
      { type: 'control', targetKg: 87.5, targetReps: 'máx' },
      { type: 'work', targetKg: 65, targetReps: '5' },
      { type: 'work', targetKg: 65, targetReps: '5' },
    ]);
    const fifth = planWave(slot, exercise, 4, none);
    expect(fifth.sets).toHaveLength(4);
    expect(fifth.sets.every((s) => s.targetKg === 80 && s.targetReps === '6')).toBe(true);
    expect(fifth.info).toEqual({
      mode: 'wave',
      cycle: 1,
      week: 0,
      weeksCount: 4,
      deload: false,
      invalidWeeks: false,
    });
  });

  it('restarts at week 1 after a reset', () => {
    const sessions = [
      sessionWith('a', '2026-01-01T10:00:00.000Z', 75, [6]),
      sessionWith('b', '2026-01-02T10:00:00.000Z', 80, [5]),
    ];
    const reset = makeSlot({ ...slot, resetAt: '2026-01-05T10:00:00.000Z' });
    const n = slotHistory(sessions, reset).length;
    expect(n).toBe(0);
    expect(planWave(reset, exercise, n, none).sets[0]?.targetKg).toBe(75);
    expect(slotHistory(sessions, slot)).toHaveLength(2);
  });

  it('uses the last line on a deload week', () => {
    const { sets, info } = planWave(slot, exercise, 1, { deload: true });
    expect(sets.map((s) => s.targetKg)).toEqual([87.5, 65, 65]);
    expect(info).toMatchObject({ deload: true, week: 3 });
  });

  it('adds the slot offset to every segment', () => {
    const shifted = makeSlot({ ...slot, offsetKg: 2.5 });
    expect(planWave(shifted, exercise, 3, none).sets.map((s) => s.targetKg)).toEqual([
      90, 67.5, 67.5,
    ]);
  });

  it('leaves percentage segments without a weight', () => {
    const pctSlot = makeSlot({ mode: 'wave', weeks: '4x6@75%' });
    const { sets } = planWave(pctSlot, exercise, 0, none);
    expect(sets).toHaveLength(4);
    expect(sets.every((s) => s.targetKg === null && s.targetReps === '6')).toBe(true);
  });

  it('flags invalid weeks and plans no cycle sets', () => {
    const bad = makeSlot({ mode: 'wave', weeks: 'nonsense' });
    const { sets, info } = planWave(bad, exercise, 7, none);
    expect(sets).toEqual([]);
    expect(info).toMatchObject({ mode: 'wave', invalidWeeks: true, weeksCount: 0 });
  });

  it('uses the exercise increment when the slot has none', () => {
    const plain = makeSlot({ mode: 'wave', weeks: '3x5@60', increment: null });
    expect(planWave(plain, exercise, 2, none).sets[0]?.targetKg).toBe(65);
  });

  it('advances by exactly one increment per full cycle', () => {
    assert(
      property(integer({ min: 0, max: 40 }), (n) => {
        const a = planWave(slot, exercise, n, none).sets.map((s) => s.targetKg);
        const b = planWave(slot, exercise, n + 4, none).sets.map((s) => s.targetKg);
        expect(b.map((kg, i) => (kg ?? NaN) - (a[i] ?? NaN))).toEqual(a.map(() => 5));
      }),
    );
  });
});
