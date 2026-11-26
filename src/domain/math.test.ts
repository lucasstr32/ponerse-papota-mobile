import { assert, integer, double, property } from 'fast-check';

import { epley, round25, roundHalf } from './math';

const weight = double({ min: 0, max: 500, noNaN: true });

describe('round25', () => {
  it('rounds half up to the nearest 2.5', () => {
    expect(round25(56.25)).toBe(57.5);
    expect(round25(0)).toBe(0);
    expect(round25(41)).toBe(40);
  });

  it('is not fooled by floating point error', () => {
    expect(round25(0.7 * 87.5)).toBe(62.5);
  });

  it('always lands on a multiple of 2.5 within 1.25 of the input', () => {
    assert(
      property(weight, (x) => {
        const r = round25(x);
        expect(Math.abs(r / 2.5 - Math.round(r / 2.5))).toBeLessThan(1e-9);
        expect(Math.abs(r - x)).toBeLessThanOrEqual(1.25 + 1e-9);
      }),
    );
  });

  it('is idempotent and monotonic', () => {
    assert(
      property(weight, weight, (a, b) => {
        expect(round25(round25(a))).toBe(round25(a));
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(round25(lo)).toBeLessThanOrEqual(round25(hi));
      }),
    );
  });
});

describe('epley', () => {
  it('estimates a one rep max', () => {
    expect(epley(87.5, 7)).toBeCloseTo(107.9167, 3);
    expect(epley(84, 3)).toBeCloseTo(92.4, 9);
  });

  it('returns the weight for a single rep or less', () => {
    expect(epley(60, 1)).toBe(60);
    expect(epley(60, 0)).toBe(60);
  });

  it('never goes below the weight and grows with reps', () => {
    assert(
      property(weight, integer({ min: 0, max: 30 }), (w, r) => {
        expect(epley(w, r)).toBeGreaterThanOrEqual(w);
        expect(epley(w, r + 1)).toBeGreaterThanOrEqual(epley(w, r));
      }),
    );
  });
});

describe('roundHalf', () => {
  it('rounds to the nearest 0.5 with half going up', () => {
    expect(roundHalf(107.92)).toBe(108);
    expect(roundHalf(92.4)).toBe(92.5);
    expect(roundHalf(92.25)).toBe(92.5);
    expect(roundHalf(92.2)).toBe(92);
  });
});
