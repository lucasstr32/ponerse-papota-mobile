import { assert, integer, property } from 'fast-check';

import { formatRepTarget, repMax, repMin } from './reps';

describe('reps', () => {
  it.each(['8–12', '8-12', '8 - 12', ' 8 – 12 '])('reads the range %j', (text) => {
    expect(repMin(text)).toBe(8);
    expect(repMax(text)).toBe(12);
  });

  it('reads a single number as both ends', () => {
    expect(repMin('10')).toBe(10);
    expect(repMax('10')).toBe(10);
  });

  it.each(['máx', 'MAX', 'Máx', 'max', 'MÁX'])(
    'treats %j as one rep minimum and no maximum',
    (text) => {
      expect(repMin(text)).toBe(1);
      expect(repMax(text)).toBeNull();
    },
  );

  it.each(['', 'abc', '8-', '-8', '8–12–14', '1,5'])('returns null for %j', (text) => {
    expect(repMin(text)).toBeNull();
    expect(repMax(text)).toBeNull();
  });

  it('formats targets with an en dash', () => {
    expect(formatRepTarget(10, 12)).toBe('10–12');
    expect(formatRepTarget(8, 8)).toBe('8');
  });

  it('round-trips through the parsers', () => {
    assert(
      property(integer({ min: 1, max: 100 }), integer({ min: 0, max: 100 }), (a, d) => {
        const text = formatRepTarget(a, a + d);
        expect(repMin(text)).toBe(a);
        expect(repMax(text)).toBe(a + d);
      }),
    );
  });
});
