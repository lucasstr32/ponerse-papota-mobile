import { assert, array, constantFrom, integer, nat, property, string, tuple } from 'fast-check';

import { formatDecimal } from './num';
import { formatRepTarget } from './reps';
import { parseWeeks } from './weeks';

describe('parseWeeks', () => {
  it('parses ranges, max and comma decimals and drops invalid lines', () => {
    const weeks = parseWeeks('3 x 8-10 @ 52,5\n1xMAX@60\nbasura');
    expect(weeks).toEqual([
      [{ sets: 3, reps: '8–10', kg: 52.5, pct: false }],
      [{ sets: 1, reps: 'máx', kg: 60, pct: false }],
    ]);
  });

  it('accepts the multiplication sign, spaces and accented max', () => {
    expect(parseWeeks('4 × 6 @ 75\n2xMÁX@ 60')).toEqual([
      [{ sets: 4, reps: '6', kg: 75, pct: false }],
      [{ sets: 2, reps: 'máx', kg: 60, pct: false }],
    ]);
  });

  it('marks percentages', () => {
    expect(parseWeeks('4x6@75%')).toEqual([[{ sets: 4, reps: '6', kg: 75, pct: true }]]);
  });

  it('reads several segments joined by plus', () => {
    expect(parseWeeks('1xmáx@87.5 + 2x5@65')).toEqual([
      [
        { sets: 1, reps: 'máx', kg: 87.5, pct: false },
        { sets: 2, reps: '5', kg: 65, pct: false },
      ],
    ]);
  });

  it('handles Windows line endings', () => {
    expect(parseWeeks('4x6@75\r\n4x5@80\r\n')).toHaveLength(2);
  });

  it('returns nothing for empty text', () => {
    expect(parseWeeks('')).toEqual([]);
    expect(parseWeeks('  \n \n')).toEqual([]);
  });

  it('drops segments with zero sets', () => {
    expect(parseWeeks('0x5@60')).toEqual([]);
    expect(parseWeeks('0x5@60 + 2x5@50')).toEqual([[{ sets: 2, reps: '5', kg: 50, pct: false }]]);
  });

  it('drops segments with absurd set counts', () => {
    expect(parseWeeks('999x5@60')).toEqual([[{ sets: 999, reps: '5', kg: 60, pct: false }]]);
    expect(parseWeeks('1000x5@60')).toEqual([]);
    expect(parseWeeks('999999999x5@60')).toEqual([]);
    expect(parseWeeks('1000x5@60 + 2x5@50')).toEqual([
      [{ sets: 2, reps: '5', kg: 50, pct: false }],
    ]);
  });

  it('parses rendered segments back to the same values', () => {
    const segment = tuple(
      integer({ min: 1, max: 9 }),
      constantFrom('single', 'range', 'max'),
      integer({ min: 1, max: 30 }),
      nat(30),
      nat(600),
      constantFrom('x', 'X', '×'),
      constantFrom('', ' ', '  '),
      constantFrom(',', '.'),
      constantFrom('max', 'MAX', 'máx', 'MÁX'),
      constantFrom(false, true),
    );
    assert(
      property(array(segment, { minLength: 1, maxLength: 4 }), (segments) => {
        const rendered = segments
          .map(([sets, kind, a, d, half, x, sp, sep, maxWord, pct]) => {
            const reps =
              kind === 'single'
                ? String(a)
                : kind === 'range'
                  ? `${a}${sp}-${sp}${a + d}`
                  : maxWord;
            const kgText = pct ? String(half) : formatDecimal(half / 2).replace(',', sep);
            return `${sets}${sp}${x}${sp}${reps}${sp}@${sp}${kgText}${pct ? '%' : ''}`;
          })
          .join(' + ');
        const expected = segments.map(([sets, kind, a, d, half, , , , , pct]) => ({
          sets,
          reps:
            kind === 'single' ? String(a) : kind === 'range' ? formatRepTarget(a, a + d) : 'máx',
          kg: pct ? half : half / 2,
          pct,
        }));
        expect(parseWeeks(rendered)).toEqual([expected]);
      }),
    );
  });

  it('never throws and never returns empty weeks', () => {
    assert(
      property(string(), (text) => {
        const weeks = parseWeeks(text);
        expect(weeks.every((w) => w.length > 0)).toBe(true);
      }),
    );
  });
});
