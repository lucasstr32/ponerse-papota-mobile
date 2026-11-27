import { assert, array, constantFrom, integer, oneof, property, tuple, constant } from 'fast-check';

import { makeEntry, makeSession, makeSet, sessionOfSets } from './builders.fixtures';
import { controlOneRm, oneRmOf, personalRecords } from './records';
import type { SessionRecord, SetRecord, SetType } from './types';

describe('oneRmOf', () => {
  it.each([
    [87.5, 7, 87.5 * (1 + 7 / 30)],
    [100, 1, 100],
    [60, 12, 60 * (1 + 12 / 30)],
  ])('estimates %p x %p', (kg, reps, expected) => {
    expect(oneRmOf({ kg, reps })).toBeCloseTo(expected, 6);
  });

  it('gives 107.9167 for 87.5 x 7 and exactly 100 for a single', () => {
    expect(oneRmOf({ kg: 87.5, reps: 7 })).toBeCloseTo(107.9167, 4);
    expect(oneRmOf({ kg: 100, reps: 1 })).toBe(100);
  });

  it('gives null above 12 reps', () => {
    expect(oneRmOf({ kg: 50, reps: 13 })).toBeNull();
  });

  it('gives null without a load or reps', () => {
    expect(oneRmOf({ kg: null, reps: 5 })).toBeNull();
    expect(oneRmOf({ kg: 0, reps: 5 })).toBeNull();
    expect(oneRmOf({ kg: 50, reps: 0 })).toBeNull();
    expect(oneRmOf({ kg: 50, reps: null })).toBeNull();
  });
});

describe('controlOneRm', () => {
  it('adds one rep to the control set', () => {
    expect(controlOneRm({ kg: 87.5, reps: 7 })).toBeCloseTo(110.8333, 4);
    expect(controlOneRm({ kg: 80, reps: 11 })).toBeCloseTo(80 * (1 + 12 / 30), 6);
  });

  it('gives null when the extra rep passes 12', () => {
    expect(controlOneRm({ kg: 80, reps: 12 })).toBeNull();
  });

  it('gives null without a load or reps', () => {
    expect(controlOneRm({ kg: null, reps: 5 })).toBeNull();
    expect(controlOneRm({ kg: 0, reps: 5 })).toBeNull();
    expect(controlOneRm({ kg: 80, reps: 0 })).toBeNull();
    expect(controlOneRm({ kg: 80, reps: null })).toBeNull();
  });
});

const day = (n: number): string => new Date(Date.UTC(2026, 0, n)).toISOString();

describe('personalRecords', () => {
  it('breaks weight ties with more reps and rep ties with more weight', () => {
    const sessions = [
      sessionOfSets('a', day(1), 'ex1', [
        makeSet({ kg: 100, reps: 3 }),
        makeSet({ kg: 100, reps: 5 }),
        makeSet({ kg: 80, reps: 10 }),
        makeSet({ kg: 90, reps: 10 }),
      ]),
    ];
    const records = personalRecords(sessions, 'ex1');
    expect(records.weight).toEqual({ sessionId: 'a', kg: 100, reps: 5 });
    expect(records.reps).toEqual({ sessionId: 'a', kg: 90, reps: 10 });
  });

  it('counts a set without a load as 0 kg for the reps record only', () => {
    const sessions = [
      sessionOfSets('a', day(1), 'ex1', [
        makeSet({ kg: null, reps: 15 }),
        makeSet({ kg: 0, reps: 12 }),
      ]),
    ];
    const records = personalRecords(sessions, 'ex1');
    expect(records.reps).toEqual({ sessionId: 'a', kg: 0, reps: 15 });
    expect(records.weight).toBeNull();
    expect(records.oneRm).toBeNull();
  });

  it('prefers a loaded set over an unloaded one with the same reps', () => {
    const sessions = [
      sessionOfSets('a', day(1), 'ex1', [
        makeSet({ kg: null, reps: 10 }),
        makeSet({ kg: 20, reps: 10 }),
      ]),
    ];
    expect(personalRecords(sessions, 'ex1').reps).toEqual({ sessionId: 'a', kg: 20, reps: 10 });
  });

  it('takes the 1RM from sets of up to 12 reps only', () => {
    const sessions = [
      sessionOfSets('a', day(1), 'ex1', [
        makeSet({ kg: 100, reps: 1 }),
        makeSet({ kg: 100, reps: 20 }),
      ]),
    ];
    const records = personalRecords(sessions, 'ex1');
    expect(records.oneRm).toEqual({ sessionId: 'a', kg: 100, reps: 1, oneRm: 100 });
    expect(records.reps?.reps).toBe(20);
  });

  it('ignores other exercises and warm-ups', () => {
    const sessions = [
      sessionOfSets('a', day(1), 'ex2', [makeSet({ kg: 200, reps: 5 })]),
      sessionOfSets('b', day(2), 'ex1', [
        makeSet({ type: 'warmup', kg: 150, reps: 5 }),
        makeSet({ kg: 60, reps: 5 }),
      ]),
    ];
    const records = personalRecords(sessions, 'ex1');
    expect(records.weight?.kg).toBe(60);
    expect(records.oneRm?.sessionId).toBe('b');
  });

  it('excludes the given session', () => {
    const sessions = [
      sessionOfSets('a', day(1), 'ex1', [makeSet({ kg: 100, reps: 5 })]),
      sessionOfSets('b', day(2), 'ex1', [makeSet({ kg: 120, reps: 5 })]),
    ];
    expect(personalRecords(sessions, 'ex1', 'b').weight?.kg).toBe(100);
    expect(personalRecords(sessions, 'ex1').weight?.kg).toBe(120);
  });

  it('gives nothing without sets', () => {
    expect(personalRecords([], 'ex1')).toEqual({ weight: null, oneRm: null, reps: null });
    expect(personalRecords([makeSession({ entries: [makeEntry()] })], 'ex1')).toEqual({
      weight: null,
      oneRm: null,
      reps: null,
    });
  });

  it('keeps the oldest set on an exact tie', () => {
    const sessions = [
      sessionOfSets('late', day(2), 'ex1', [makeSet({ kg: 100, reps: 5 })]),
      sessionOfSets('early', day(1), 'ex1', [makeSet({ kg: 100, reps: 5 })]),
    ];
    const records = personalRecords(sessions, 'ex1');
    expect(records.weight?.sessionId).toBe('early');
    expect(records.oneRm?.sessionId).toBe('early');
    expect(records.reps?.sessionId).toBe('early');
  });

  it('counts failed sets', () => {
    const sessions = [
      sessionOfSets('a', day(1), 'ex1', [makeSet({ kg: 100, reps: 3, failed: true })]),
    ];
    expect(personalRecords(sessions, 'ex1').weight?.kg).toBe(100);
  });
});

const setArb = tuple(
  oneof(constant(null), integer({ min: 0, max: 200 })),
  oneof(constant(null), integer({ min: 0, max: 15 })),
  constantFrom<SetType>('warmup', 'work', 'control'),
  constantFrom(false, true),
).map(([kg, reps, type, failed]): SetRecord => makeSet({ kg, reps, type, failed }));

const sessionsArb = array(array(setArb, { maxLength: 5 }), { maxLength: 6 }).map(
  (all): SessionRecord[] => all.map((sets, i) => sessionOfSets(`s${i}`, day(i + 1), 'ex1', sets)),
);

describe('personalRecords properties', () => {
  it('does not depend on the order of the sessions', () => {
    assert(
      property(sessionsArb, (sessions) => {
        expect(personalRecords([...sessions].reverse(), 'ex1')).toEqual(
          personalRecords(sessions, 'ex1'),
        );
      }),
    );
  });

  it('ignores warm-ups', () => {
    assert(
      property(sessionsArb, integer({ min: 1, max: 200 }), (sessions, kg) => {
        const extra = sessionOfSets('warm', day(30), 'ex1', [
          makeSet({ type: 'warmup', kg: kg + 500, reps: 5 }),
        ]);
        expect(personalRecords([...sessions, extra], 'ex1')).toEqual(
          personalRecords(sessions, 'ex1'),
        );
      }),
    );
  });

  it('is never below an eligible set', () => {
    assert(
      property(sessionsArb, (sessions) => {
        const records = personalRecords(sessions, 'ex1');
        for (const set of sessions.flatMap((s) => s.entries.flatMap((e) => e.sets))) {
          if (set.type === 'warmup' || set.reps === null || set.reps <= 0) continue;
          expect(records.reps?.reps ?? -1).toBeGreaterThanOrEqual(set.reps);
          if (set.kg !== null && set.kg > 0) {
            expect(records.weight?.kg ?? -1).toBeGreaterThanOrEqual(set.kg);
          }
          const estimate = oneRmOf(set);
          if (estimate !== null) {
            expect(records.oneRm?.oneRm ?? -1).toBeGreaterThanOrEqual(estimate);
          }
        }
      }),
    );
  });

  it('treats excluding a session as removing it', () => {
    assert(
      property(sessionsArb, integer({ min: 0, max: 5 }), (sessions, i) => {
        const excluded = sessions[i];
        const kept = sessions.filter((s) => s !== excluded);
        expect(personalRecords(sessions, 'ex1', excluded?.id ?? null)).toEqual(
          personalRecords(kept, 'ex1'),
        );
      }),
    );
  });
});
