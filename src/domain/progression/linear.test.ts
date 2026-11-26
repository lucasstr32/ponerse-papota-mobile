import { assert, boolean, array, integer, property } from 'fast-check';

import { makeEntry, makeExercise, makeSet, makeSlot } from '../builders.fixtures';
import { formatDecimal, num } from '../num';
import type { EntryRecord } from '../types';
import { planLinear } from './linear';

const slot = makeSlot({ mode: 'linear', sets: 3, repMin: 5, repMax: 5, kg: 60 });
const exercise = makeExercise({ increment: 2.5 });

/** A session of three sets aimed at `target` that either hit or missed the reps. */
function session(target: number | null, achieved: boolean, loaded: number | null = target) {
  const reps = achieved ? 5 : 4;
  return makeEntry({
    sets: [reps, 5, 5].map((r) =>
      makeSet({ targetKg: target, targetReps: '5', kg: loaded, reps: r }),
    ),
  });
}

const targetOf = (history: EntryRecord[]): number | null =>
  planLinear(slot, exercise, history).sets[0]?.targetKg ?? null;

describe('planLinear', () => {
  it('goes 62.5 → 62.5 → 57.5 after achieved, fail, fail', () => {
    const first = session(60, true);
    expect(targetOf([first])).toBe(62.5);
    const second = session(62.5, false);
    expect(targetOf([first, second])).toBe(62.5);
    const third = session(62.5, false);
    const result = planLinear(slot, exercise, [first, second, third]);
    expect(result.sets[0]?.targetKg).toBe(57.5);
    expect(result.info).toEqual({ mode: 'linear', fails: 0, lastOutcome: 'deload' });
  });

  it('plans the configured sets and reps', () => {
    const { sets } = planLinear(slot, exercise, []);
    expect(sets).toHaveLength(3);
    expect(sets.every((s) => s.type === 'work' && s.targetReps === '5')).toBe(true);
  });

  it('starts from the slot weight without history', () => {
    const { sets, info } = planLinear(slot, exercise, []);
    expect(sets[0]?.targetKg).toBe(60);
    expect(info).toEqual({ mode: 'linear', fails: 0, lastOutcome: null });
  });

  it('counts an achieved session with an empty weight', () => {
    const entry = session(60, true, null);
    expect(targetOf([entry])).toBe(62.5);
  });

  it('does not achieve with a lighter weight than the target', () => {
    expect(targetOf([session(60, true, 55)])).toBe(60);
  });

  it('counts a set without reps as not achieved', () => {
    const entry = makeEntry({
      sets: [5, 5, null].map((r) => makeSet({ targetKg: 60, targetReps: '5', kg: 60, reps: r })),
    });
    const result = planLinear(slot, exercise, [entry]);
    expect(result.sets[0]?.targetKg).toBe(60);
    expect(result.info).toEqual({ mode: 'linear', fails: 1, lastOutcome: 'firstFail' });
  });

  it('resets the fail counter after an achieved session', () => {
    const history = [session(60, false), session(60, true), session(62.5, false)];
    const result = planLinear(slot, exercise, history);
    expect(result.sets[0]?.targetKg).toBe(62.5);
    expect(result.info).toEqual({ mode: 'linear', fails: 1, lastOutcome: 'firstFail' });
  });

  it('uses the heaviest loaded weight when the target is empty', () => {
    const entry = session(null, true, 50);
    const result = planLinear(slot, exercise, [entry]);
    expect(result.sets[0]?.targetKg).toBe(52.5);
  });

  it('keeps the weight empty while nothing was loaded and only counts failures', () => {
    const empty = makeSlot({ mode: 'linear', sets: 3, repMin: 5, repMax: 5, kg: null });
    const ok = session(null, true, null);
    const bad = session(null, false, null);
    expect(planLinear(empty, exercise, [ok]).sets[0]?.targetKg).toBeNull();
    const twice = planLinear(empty, exercise, [bad, bad]);
    expect(twice.sets[0]?.targetKg).toBeNull();
    expect(twice.info).toEqual({ mode: 'linear', fails: 0, lastOutcome: 'deload' });
    expect(planLinear(empty, exercise, [bad]).info).toEqual({
      mode: 'linear',
      fails: 1,
      lastOutcome: 'firstFail',
    });
  });

  it('falls back to the slot minimum when the target reps are unreadable', () => {
    const entry = makeEntry({
      sets: [makeSet({ targetKg: 60, targetReps: '', kg: 60, reps: 5 })],
    });
    expect(targetOf([entry])).toBe(62.5);
  });

  it('prefers the slot increment', () => {
    const custom = makeSlot({ ...slot, increment: 5 });
    expect(planLinear(custom, exercise, [session(60, true)]).sets[0]?.targetKg).toBe(65);
  });

  it('adds one increment after an achieved session and never rises after two fails', () => {
    assert(
      property(array(boolean(), { maxLength: 6 }), boolean(), (previous, achieved) => {
        const history = [...previous.map((a) => session(60, a)), session(70, achieved)];
        const target = targetOf(history);
        if (achieved) expect(target).toBe(72.5);
        const twoFails = [...history, session(70, false), session(70, false)];
        expect(targetOf(twoFails)).toBeLessThanOrEqual(70);
      }),
    );
  });

  it('counts loading exactly the computed target as achieved with decimal weights', () => {
    assert(
      property(
        integer({ min: 0, max: 800 }),
        integer({ min: 1, max: 40 }),
        integer({ min: 1, max: 40 }),
        (k, incTenths, quarter) => {
          const start = quarter % 2 === 0 ? k / 10 : k / 4;
          const decimalSlot = makeSlot({ ...slot, kg: start, increment: incTenths / 10 });
          const first = planLinear(decimalSlot, exercise, []).sets[0]?.targetKg ?? 0;
          const loaded = num(formatDecimal(first));
          const second = planLinear(decimalSlot, exercise, [session(first, true, loaded)]);
          const target = second.sets[0]?.targetKg ?? 0;
          expect(second.info).toEqual({ mode: 'linear', fails: 0, lastOutcome: 'achieved' });
          const third = planLinear(decimalSlot, exercise, [
            session(first, true, loaded),
            session(target, true, num(formatDecimal(target))),
          ]);
          expect(third.info).toEqual({ mode: 'linear', fails: 0, lastOutcome: 'achieved' });
        },
      ),
    );
  });
});
