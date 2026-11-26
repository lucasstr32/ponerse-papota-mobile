import { assert, double, property } from 'fast-check';

import { makeExercise } from './builders.fixtures';
import { warmupSets } from './warmup';

const barbell = makeExercise({ equipment: 'barbell' });
const pairs = (top: number, exercise = barbell, level: 'one' | 'full' = 'full') =>
  warmupSets(level, top, exercise).map((s) => [s.targetKg, s.targetReps]);

describe('warmupSets', () => {
  it('full barbell warm-up for 75', () => {
    expect(pairs(75)).toEqual([
      [20, '10'],
      [37.5, '5'],
      [52.5, '3'],
      [65, '2'],
    ]);
  });

  it('floor lift skips the empty bar', () => {
    const deadlift = makeExercise({ equipment: 'barbell', fromFloor: true });
    expect(pairs(90, deadlift)).toEqual([
      [45, '5'],
      [62.5, '3'],
      [77.5, '2'],
    ]);
  });

  it('marks every set as a warm-up', () => {
    expect(warmupSets('full', 75, barbell).every((s) => s.type === 'warmup')).toBe(true);
  });

  it('adds one set at 60 percent for the one-set level', () => {
    expect(pairs(65, barbell, 'one')).toEqual([[40, '5']]);
  });

  it('rounds half up for 87.5', () => {
    expect(pairs(87.5)).toEqual([
      [20, '10'],
      [45, '5'],
      [62.5, '3'],
      [75, '2'],
    ]);
  });

  it('uses a single rep at the top set below 60', () => {
    expect(pairs(50)).toEqual([
      [20, '10'],
      [25, '5'],
      [35, '3'],
      [42.5, '1'],
    ]);
  });

  it('drops the duplicated 20 for a 40 top', () => {
    expect(pairs(40)).toEqual([
      [20, '10'],
      [27.5, '3'],
      [35, '1'],
    ]);
  });

  it('has nothing for no level, no top or a top of zero or less', () => {
    expect(warmupSets('none', 75, barbell)).toEqual([]);
    expect(warmupSets('full', null, barbell)).toEqual([]);
    expect(warmupSets('full', 0, barbell)).toEqual([]);
    expect(warmupSets('one', -5, barbell)).toEqual([]);
  });

  it('has no empty bar for dumbbells or below 40', () => {
    const dumbbell = makeExercise({ equipment: 'dumbbell' });
    expect(pairs(75, dumbbell)[0]).toEqual([37.5, '5']);
    expect(pairs(30)[0]?.[0]).not.toBe(20);
  });

  it('always yields at most four increasing plate-friendly weights below the top', () => {
    assert(
      property(double({ min: -10, max: 400, noNaN: true }), (top) => {
        for (const exercise of [barbell, makeExercise({ equipment: 'machine' })]) {
          const weights = warmupSets('full', top, exercise).map((s) => s.targetKg ?? NaN);
          expect(weights.length).toBeLessThanOrEqual(4);
          weights.forEach((w, i) => {
            expect(w).toBeGreaterThan(0);
            expect(w).toBeLessThan(top);
            expect(Math.abs(w / 2.5 - Math.round(w / 2.5))).toBeLessThan(1e-9);
            if (i > 0) expect(w).toBeGreaterThan(weights[i - 1] ?? Infinity);
          });
        }
      }),
    );
  });
});
