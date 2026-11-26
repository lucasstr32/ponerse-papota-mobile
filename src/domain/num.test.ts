import { assert, nat, property } from 'fast-check';

import { num } from './num';

describe('num', () => {
  it.each([
    ['52,5', 52.5],
    ['52.5', 52.5],
    [' 60 ', 60],
    ['0', 0],
    [',5', 0.5],
  ])('parses %j', (text, expected) => {
    expect(num(text)).toBe(expected);
  });

  it.each(['', '   ', 'abc', '1,2,3', '1.000,5', 'Infinity', '1e3'])(
    'returns null for %j',
    (text) => {
      expect(num(text)).toBeNull();
    },
  );

  it('treats comma and point as the same decimal separator', () => {
    assert(
      property(nat(999), nat(99), (whole, fraction) => {
        const value = num(`${whole}.${fraction}`);
        expect(value).not.toBeNull();
        expect(num(`${whole},${fraction}`)).toBe(value);
      }),
    );
  });
});
