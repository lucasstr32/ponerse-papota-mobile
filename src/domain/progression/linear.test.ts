import { assert, boolean, array, integer, property } from 'fast-check';

import { makeEntry, makeExercise, makeSet, makeSlot } from '../builders.fixtures';
import { round25 } from '../math';
import { formatDecimal, num } from '../num';
import type { EntryRecord } from '../types';
import { isAchieved, planLinear } from './linear';

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

  it('counts a set marked as failed as missed even with full reps', () => {
    const failedEntry = makeEntry({
      sets: [5, 5, 5].map((r, i) =>
        makeSet({ targetKg: 60, targetReps: '5', kg: 60, reps: r, failed: i === 2 }),
      ),
    });
    const result = planLinear(slot, exercise, [failedEntry]);
    expect(result.sets[0]?.targetKg).toBe(60);
    expect(result.info).toEqual({ mode: 'linear', fails: 1, lastOutcome: 'firstFail' });
  });

  it('deloads after two sessions with a set marked as failed', () => {
    const failedEntry = makeEntry({
      sets: [5, 5, 5].map((r, i) =>
        makeSet({ targetKg: 60, targetReps: '5', kg: 60, reps: r, failed: i === 0 }),
      ),
    });
    const result = planLinear(slot, exercise, [failedEntry, failedEntry]);
    expect(result.sets[0]?.targetKg).toBe(round25(60 * 0.9));
    expect(result.info).toEqual({ mode: 'linear', fails: 0, lastOutcome: 'deload' });
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

  it('snaps the raised target to two decimals', () => {
    const tiny = makeSlot({ ...slot, kg: 0.1, increment: 0.2 });
    expect(planLinear(tiny, exercise, [session(0.1, true)]).sets[0]?.targetKg).toBe(0.3);
  });

  it('prefers the slot increment', () => {
    const custom = makeSlot({ ...slot, increment: 5 });
    expect(planLinear(custom, exercise, [session(60, true)]).sets[0]?.targetKg).toBe(65);
  });

  it('follows the achieved, first fail and deload rules over any sequence', () => {
    assert(
      property(
        integer({ min: 8, max: 80 }),
        array(boolean(), { minLength: 1, maxLength: 12 }),
        (steps, outcomes) => {
          const start = steps * 2.5;
          const custom = makeSlot({ ...slot, kg: start });
          const history: EntryRecord[] = [];
          let tw = start;
          let fails = 0;
          for (const achieved of outcomes) {
            history.push(session(tw, achieved));
            const result = planLinear(custom, exercise, history);
            if (achieved) {
              tw += 2.5;
              fails = 0;
              expect(result.info).toEqual({ mode: 'linear', fails: 0, lastOutcome: 'achieved' });
            } else if (fails === 1) {
              tw = round25(tw * 0.9);
              fails = 0;
              expect(result.info).toEqual({ mode: 'linear', fails: 0, lastOutcome: 'deload' });
            } else {
              fails = 1;
              expect(result.info).toEqual({ mode: 'linear', fails: 1, lastOutcome: 'firstFail' });
            }
            expect(result.sets[0]?.targetKg).toBe(tw);
          }
        },
      ),
    );
  });

  describe('with an accepted raise', () => {
    it('adds the raise to the weight after an achieved session', () => {
      expect(planLinear(slot, exercise, [session(60, true)], [2.5]).sets[0]?.targetKg).toBe(65);
    });

    it('carries the raise once, not again on the next achieved session', () => {
      const history = [session(60, true), session(65, true)];
      expect(planLinear(slot, exercise, history, [2.5, 0]).sets[0]?.targetKg).toBe(67.5);
    });

    it('applies the raise to whatever weight the engine leaves, even after a first fail', () => {
      const result = planLinear(slot, exercise, [session(60, false)], [2.5]);
      expect(result.sets[0]?.targetKg).toBe(62.5);
      expect(result.info).toEqual({ mode: 'linear', fails: 1, lastOutcome: 'firstFail' });
    });

    it('keeps the weight empty when nothing was loaded', () => {
      const empty = makeSlot({ ...slot, kg: null });
      expect(
        planLinear(empty, exercise, [session(null, true, null)], [2.5]).sets[0]?.targetKg,
      ).toBeNull();
    });

    it('ignores the slot offset', () => {
      const shifted = makeSlot({ ...slot, offsetKg: 5 });
      expect(planLinear(shifted, exercise, [session(60, true)], [2.5]).sets[0]?.targetKg).toBe(65);
      expect(planLinear(shifted, exercise, []).sets[0]?.targetKg).toBe(60);
    });

    it('gives the same plan with no raises as with zero raises', () => {
      assert(
        property(array(boolean(), { minLength: 1, maxLength: 12 }), (outcomes) => {
          const history = outcomes.map((achieved) => session(60, achieved));
          const zeros = outcomes.map(() => 0);
          expect(planLinear(slot, exercise, history, zeros)).toEqual(
            planLinear(slot, exercise, history),
          );
        }),
      );
    });
  });

  describe('isAchieved', () => {
    it('is true when every set has the reps and the target weight', () => {
      expect(isAchieved(session(60, true), slot)).toBe(true);
    });

    it('is false with reps under the minimum', () => {
      expect(isAchieved(session(60, false), slot)).toBe(false);
    });

    it('is false when a set is marked as failed or has no reps', () => {
      const failed = makeEntry({
        sets: [makeSet({ targetKg: 60, targetReps: '5', kg: 60, reps: 5, failed: true })],
      });
      const empty = makeEntry({
        sets: [makeSet({ targetKg: 60, targetReps: '5', kg: 60, reps: null })],
      });
      expect(isAchieved(failed, slot)).toBe(false);
      expect(isAchieved(empty, slot)).toBe(false);
    });

    it('is false when a set was loaded under the target and true when it is empty', () => {
      expect(isAchieved(session(60, true, 55), slot)).toBe(false);
      expect(isAchieved(session(60, true, null), slot)).toBe(true);
    });

    it('agrees with the engine over any sequence', () => {
      assert(
        property(array(boolean(), { minLength: 1, maxLength: 8 }), (outcomes) => {
          const history = outcomes.map((achieved) => session(60, achieved));
          const last = history[history.length - 1];
          const result = planLinear(slot, exercise, history);
          const outcome = result.info.mode === 'linear' ? result.info.lastOutcome : null;
          if (last !== undefined && isAchieved(last, slot)) expect(outcome).toBe('achieved');
          else expect(outcome).not.toBe('achieved');
        }),
      );
    });
  });

  it('ignores warm-up sets of the previous entry', () => {
    const entry = makeEntry({
      sets: [
        makeSet({ type: 'warmup', targetKg: 30, targetReps: '5', kg: 30, reps: 1 }),
        ...[5, 5, 5].map((r) => makeSet({ targetKg: 60, targetReps: '5', kg: 60, reps: r })),
      ],
    });
    const result = planLinear(slot, exercise, [entry]);
    expect(result.sets[0]?.targetKg).toBe(62.5);
    expect(result.info).toEqual({ mode: 'linear', fails: 0, lastOutcome: 'achieved' });
  });

  it('counts loading exactly the computed target as achieved with decimal weights', () => {
    assert(
      property(
        integer({ min: 0, max: 800 }),
        integer({ min: 1, max: 40 }),
        boolean(),
        (k, incTenths, quarter) => {
          const start = quarter ? k / 4 : k / 10;
          const inc = incTenths / 10;
          const decimalSlot = makeSlot({ ...slot, kg: start, increment: inc });
          const first = planLinear(decimalSlot, exercise, []).sets[0]?.targetKg ?? NaN;
          const loaded = num(formatDecimal(first));
          const second = planLinear(decimalSlot, exercise, [session(first, true, loaded)]);
          const target = second.sets[0]?.targetKg ?? NaN;
          expect(target).toBe(Math.round((start + inc) * 100) / 100);
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
