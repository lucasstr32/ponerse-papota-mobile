import { assert, array, constantFrom, integer, property, tuple } from 'fast-check';

import { makeSet, makeSlot, sessionOfSets } from './builders.fixtures';
import { epley } from './math';
import { nextReference, planNextBlock, scaleWeeks } from './next-block';
import { formatWeeks, parseWeeks } from './weeks';
import type { WaveWeek } from './weeks';

const day = (n: number): string => new Date(Date.UTC(2026, 0, n)).toISOString();

const WAVE = '4x6@75\n4x5@80\n5x3@87.5\n1xmáx@87.5 + 2x5@65';

describe('nextReference', () => {
  it('prefers the control over the record', () => {
    const sessions = [
      sessionOfSets('a', day(1), 'ex1', [makeSet({ kg: 100, reps: 1 })]),
      sessionOfSets('b', day(2), 'ex1', [makeSet({ type: 'control', kg: 87.5, reps: 7 })]),
    ];
    const ref = nextReference(sessions, 'ex1');
    expect(ref?.source).toBe('control');
    expect(ref?.sessionId).toBe('b');
    expect(ref?.next).toBeCloseTo(epley(87.5, 8), 6);
  });

  it('uses the last control even when it is lower', () => {
    const sessions = [
      sessionOfSets('a', day(1), 'ex1', [makeSet({ type: 'control', kg: 100, reps: 7 })]),
      sessionOfSets('b', day(2), 'ex1', [makeSet({ type: 'control', kg: 80, reps: 7 })]),
    ];
    const ref = nextReference(sessions, 'ex1');
    expect(ref?.sessionId).toBe('b');
    expect(ref?.next).toBeCloseTo(epley(80, 8), 6);
  });

  it('accepts a control of 11 reps', () => {
    const sessions = [
      sessionOfSets('a', day(1), 'ex1', [makeSet({ type: 'control', kg: 60, reps: 11 })]),
    ];
    expect(nextReference(sessions, 'ex1')?.next).toBeCloseTo(epley(60, 12), 6);
  });

  it('skips a control that cannot be used and takes the last valid one', () => {
    const sessions = [
      sessionOfSets('a', day(1), 'ex1', [makeSet({ type: 'control', kg: 80, reps: 7 })]),
      sessionOfSets('b', day(2), 'ex1', [
        makeSet({ type: 'control', kg: 80, reps: 12 }),
        makeSet({ type: 'control', kg: null, reps: 5 }),
      ]),
    ];
    const ref = nextReference(sessions, 'ex1');
    expect(ref?.source).toBe('control');
    expect(ref?.sessionId).toBe('a');
  });

  it('falls back to the record times 0.95 when no control is usable', () => {
    const sessions = [
      sessionOfSets('a', day(1), 'ex1', [makeSet({ kg: 100, reps: 1 })]),
      sessionOfSets('b', day(2), 'ex1', [makeSet({ type: 'control', kg: 60, reps: 12 })]),
    ];
    const ref = nextReference(sessions, 'ex1');
    expect(ref?.source).toBe('record');
    expect(ref?.sessionId).toBe('a');
    expect(ref?.next).toBeCloseTo(95, 6);
  });

  it('gives nothing without controls or records', () => {
    expect(nextReference([], 'ex1')).toBeNull();
    const heavyReps = [sessionOfSets('a', day(1), 'ex1', [makeSet({ kg: 40, reps: 20 })])];
    expect(nextReference(heavyReps, 'ex1')).toBeNull();
  });

  it('ignores other exercises and approach sets', () => {
    const sessions = [
      sessionOfSets('a', day(1), 'ex2', [makeSet({ type: 'control', kg: 90, reps: 5 })]),
      sessionOfSets('b', day(2), 'ex1', [makeSet({ type: 'warmup', kg: 90, reps: 5 })]),
    ];
    expect(nextReference(sessions, 'ex1')).toBeNull();
  });
});

describe('planNextBlock', () => {
  const control = sessionOfSets('c1', day(10), 'squat', [
    makeSet({ type: 'control', kg: 87.5, reps: 7 }),
  ]);
  const waveSlot = makeSlot({
    uid: 'w1',
    exerciseId: 'squat',
    mode: 'wave',
    weeks: WAVE,
    offsetKg: 5,
  });

  it('scales the weeks to the new reference and resets the offset', () => {
    const plan = planNextBlock({
      slots: [waveSlot],
      refOneRm: { squat: 99 },
      sessions: [control],
    });
    expect(plan.slots).toEqual([
      {
        uid: 'w1',
        weeks: '4x6@85\n4x5@90\n5x3@97.5\n1xmáx@97.5 + 2x5@72.5',
        offsetKg: 0,
      },
    ]);
    expect(plan.references).toHaveLength(1);
    expect(plan.references[0]).toMatchObject({
      exerciseId: 'squat',
      previous: 99,
      source: 'control',
      sessionId: 'c1',
    });
    expect(plan.references[0]?.next).toBeCloseTo(110.8333, 4);
  });

  it('leaves out the slots that are not recalculated', () => {
    const base = { exerciseId: 'squat', weeks: WAVE };
    const plan = planNextBlock({
      slots: [
        makeSlot({ ...base, uid: 'range', mode: 'range' }),
        makeSlot({ ...base, uid: 'linear', mode: 'linear' }),
        makeSlot({ ...base, uid: 'free', mode: 'free' }),
        makeSlot({ ...base, uid: 'noref', mode: 'wave', exerciseId: 'bench' }),
        makeSlot({ ...base, uid: 'zero', mode: 'wave', exerciseId: 'zeroed' }),
        makeSlot({ ...base, uid: 'nonew', mode: 'wave', exerciseId: 'deadlift' }),
        makeSlot({ uid: 'badweeks', mode: 'wave', exerciseId: 'squat', weeks: 'basura' }),
      ],
      refOneRm: { squat: 99, zeroed: 0, deadlift: 150 },
      sessions: [control],
    });
    expect(plan.slots).toEqual([]);
  });

  it('keeps percentages unchanged', () => {
    const plan = planNextBlock({
      slots: [makeSlot({ uid: 'p', exerciseId: 'squat', mode: 'wave', weeks: '4x6@75%' })],
      refOneRm: { squat: 99 },
      sessions: [control],
    });
    expect(plan.slots[0]?.weeks).toBe('4x6@75%');
  });

  it('lists references in the order of the previous maxima, only with a new one', () => {
    const bench = sessionOfSets('c2', day(11), 'bench', [makeSet({ kg: 100, reps: 1 })]);
    const plan = planNextBlock({
      slots: [],
      refOneRm: { deadlift: 150, bench: 90, squat: 99 },
      sessions: [control, bench],
    });
    expect(plan.references.map((r) => r.exerciseId)).toEqual(['bench', 'squat']);
    expect(plan.references[0]?.source).toBe('record');
  });
});

const weeksArb = array(
  array(
    tuple(
      integer({ min: 1, max: 20 }),
      constantFrom('5', '8–10', 'máx'),
      integer({ min: 0, max: 40000 }),
      constantFrom(false, true),
    ),
    { minLength: 1, maxLength: 3 },
  ),
  { minLength: 1, maxLength: 4 },
).map((weeks): WaveWeek[] =>
  weeks.map((week) =>
    week.map(([sets, reps, hundredths, pct]) => ({ sets, reps, kg: hundredths / 100, pct })),
  ),
);

const refArb = integer({ min: 20, max: 300 });

describe('scaleWeeks', () => {
  it('keeps sets, reps and the percentage flag', () => {
    assert(
      property(weeksArb, refArb, refArb, (weeks, prev, next) => {
        const scaled = scaleWeeks(weeks, prev, next);
        expect(scaled.map((w) => w.map((s) => [s.sets, s.reps, s.pct]))).toEqual(
          weeks.map((w) => w.map((s) => [s.sets, s.reps, s.pct])),
        );
      }),
    );
  });

  it('leaves percentages untouched', () => {
    assert(
      property(weeksArb, refArb, refArb, (weeks, prev, next) => {
        const scaled = scaleWeeks(weeks, prev, next);
        weeks.forEach((w, i) =>
          w.forEach((s, j) => {
            if (s.pct) expect(scaled[i]?.[j]?.kg).toBe(s.kg);
          }),
        );
      }),
    );
  });

  it('rounds every weight to 2.5, within 1.25 of the exact scaling', () => {
    assert(
      property(weeksArb, refArb, refArb, (weeks, prev, next) => {
        const scaled = scaleWeeks(weeks, prev, next);
        weeks.forEach((w, i) =>
          w.forEach((s, j) => {
            if (s.pct) return;
            const kg = scaled[i]?.[j]?.kg ?? NaN;
            expect(kg % 2.5).toBe(0);
            expect(Math.abs(kg - (s.kg * next) / prev)).toBeLessThanOrEqual(1.25 + 1e-5);
          }),
        );
      }),
    );
  });

  it('is the identity when the reference does not change and weights are multiples of 2.5', () => {
    assert(
      property(
        array(array(integer({ min: 0, max: 200 }), { minLength: 1, maxLength: 3 }), {
          minLength: 1,
          maxLength: 4,
        }),
        refArb,
        (weeks, ref) => {
          const input: WaveWeek[] = weeks.map((w) =>
            w.map((n) => ({ sets: 3, reps: '5', kg: n * 2.5, pct: false })),
          );
          expect(scaleWeeks(input, ref, ref)).toEqual(input);
        },
      ),
    );
  });

  it('never lowers a weight when the new reference goes up', () => {
    assert(
      property(weeksArb, refArb, refArb, refArb, (weeks, prev, a, b) => {
        const low = scaleWeeks(weeks, prev, Math.min(a, b));
        const high = scaleWeeks(weeks, prev, Math.max(a, b));
        low.forEach((w, i) =>
          w.forEach((s, j) => {
            expect(high[i]?.[j]?.kg ?? -1).toBeGreaterThanOrEqual(s.kg);
          }),
        );
      }),
    );
  });
});

describe('planNextBlock properties', () => {
  it('writes exactly the scaled weeks', () => {
    assert(
      property(weeksArb, integer({ min: 20, max: 300 }), (weeks, prev) => {
        const slot = makeSlot({
          uid: 'w',
          exerciseId: 'squat',
          mode: 'wave',
          weeks: formatWeeks(weeks),
        });
        const sessions = [
          sessionOfSets('c', day(1), 'squat', [makeSet({ type: 'control', kg: 100, reps: 5 })]),
        ];
        const plan = planNextBlock({ slots: [slot], refOneRm: { squat: prev }, sessions });
        const next = plan.references[0]?.next ?? NaN;
        expect(parseWeeks(plan.slots[0]?.weeks ?? '')).toEqual(
          scaleWeeks(parseWeeks(slot.weeks), prev, next),
        );
      }),
    );
  });
});
