import { assert, array, integer, property } from 'fast-check';

import { makeEntry, makeSession, makeSet, makeSlot, sessionWith } from './builders.fixtures';
import { hasWork, loggedReps, slotHistory, slotTimeline, workSets } from './history';

describe('workSets and hasWork', () => {
  it('keeps work and control sets and drops warm-ups', () => {
    const entry = makeEntry({
      sets: [
        makeSet({ type: 'warmup', reps: 5 }),
        makeSet({ type: 'work', reps: 10 }),
        makeSet({ type: 'control', reps: 3 }),
      ],
    });
    expect(workSets(entry).map((s) => s.type)).toEqual(['work', 'control']);
    expect(hasWork(entry)).toBe(true);
  });

  it('has no work with only warm-ups or sets without reps', () => {
    expect(hasWork(makeEntry({ sets: [makeSet({ type: 'warmup', reps: 5 })] }))).toBe(false);
    expect(hasWork(makeEntry({ sets: [makeSet({ reps: null })] }))).toBe(false);
    expect(hasWork(makeEntry())).toBe(false);
  });

  it('counts zero reps as loaded', () => {
    expect(hasWork(makeEntry({ sets: [makeSet({ reps: 0 })] }))).toBe(true);
  });
});

describe('loggedReps', () => {
  it('lists the reps of work sets and skips empty ones and warm-ups', () => {
    const entry = makeEntry({
      sets: [
        makeSet({ type: 'warmup', reps: 5 }),
        makeSet({ reps: 10 }),
        makeSet({ reps: null }),
        makeSet({ type: 'control', reps: 0 }),
      ],
    });
    expect(loggedReps(entry)).toEqual([10, 0]);
  });
});

describe('slotHistory', () => {
  const slot = makeSlot();

  it('orders by createdAt even when the input is shuffled', () => {
    const sessions = [
      sessionWith('c', '2026-01-03T10:00:00.000Z', 42.5, [10]),
      sessionWith('a', '2026-01-01T10:00:00.000Z', 40, [10]),
      sessionWith('b', '2026-01-02T10:00:00.000Z', 40, [11]),
    ];
    const history = slotHistory(sessions, slot);
    expect(history.map((e) => e.sets[0]?.kg)).toEqual([40, 40, 42.5]);
  });

  it('excludes the current session and later ones', () => {
    const sessions = [
      sessionWith('a', '2026-01-01T10:00:00.000Z', 40, [10]),
      sessionWith('b', '2026-01-02T10:00:00.000Z', 41, [10]),
      sessionWith('c', '2026-01-03T10:00:00.000Z', 42, [10]),
    ];
    const history = slotHistory(sessions, slot, {
      id: 'b',
      createdAt: '2026-01-02T10:00:00.000Z',
    });
    expect(history).toHaveLength(1);
    expect(history[0]?.sets[0]?.kg).toBe(40);
  });

  it('excludes sessions at or before resetAt', () => {
    const sessions = [
      sessionWith('a', '2026-01-01T10:00:00.000Z', 40, [10]),
      sessionWith('b', '2026-01-02T10:00:00.000Z', 41, [10]),
      sessionWith('c', '2026-01-03T10:00:00.000Z', 42, [10]),
    ];
    const history = slotHistory(sessions, makeSlot({ resetAt: '2026-01-02T10:00:00.000Z' }));
    expect(history.map((e) => e.sets[0]?.kg)).toEqual([42]);
  });

  it('ignores other slots, replaced entries and entries without work', () => {
    const sessions = [
      sessionWith('a', '2026-01-01T10:00:00.000Z', 40, [10], { slotUid: 'other' }),
      sessionWith('b', '2026-01-02T10:00:00.000Z', 41, [10], { replacesSlotUid: 'slot1' }),
      makeSession({
        id: 'c',
        createdAt: '2026-01-03T10:00:00.000Z',
        entries: [makeEntry({ sets: [makeSet({ type: 'warmup', kg: 20, reps: 5 })] })],
      }),
      sessionWith('d', '2026-01-04T10:00:00.000Z', 43, [null]),
    ];
    expect(slotHistory(sessions, slot)).toEqual([]);
  });

  it('takes the first entry with work when a session repeats the slot', () => {
    const session = makeSession({
      id: 'a',
      createdAt: '2026-01-01T10:00:00.000Z',
      entries: [
        makeEntry({ sets: [makeSet({ reps: null })] }),
        makeEntry({ sets: [makeSet({ kg: 40, reps: 10 })] }),
        makeEntry({ sets: [makeSet({ kg: 99, reps: 10 })] }),
      ],
    });
    const history = slotHistory([session], slot);
    expect(history).toHaveLength(1);
    expect(history[0]?.sets[0]?.kg).toBe(40);
  });
});

describe('slotTimeline', () => {
  const slot = makeSlot();

  it('returns the session id and date next to each entry, oldest first', () => {
    const sessions = [
      sessionWith('c', '2026-01-03T10:00:00.000Z', 42.5, [10]),
      sessionWith('a', '2026-01-01T10:00:00.000Z', 40, [10]),
      sessionWith('b', '2026-01-02T10:00:00.000Z', 41, [11]),
    ];
    const timeline = slotTimeline(sessions, slot);
    expect(timeline.map((i) => i.sessionId)).toEqual(['a', 'b', 'c']);
    expect(timeline.map((i) => i.createdAt)).toEqual([
      '2026-01-01T10:00:00.000Z',
      '2026-01-02T10:00:00.000Z',
      '2026-01-03T10:00:00.000Z',
    ]);
    expect(timeline.map((i) => i.entry.sets[0]?.kg)).toEqual([40, 41, 42.5]);
  });

  it('excludes the current session and later ones', () => {
    const sessions = [
      sessionWith('a', '2026-01-01T10:00:00.000Z', 40, [10]),
      sessionWith('b', '2026-01-02T10:00:00.000Z', 41, [10]),
      sessionWith('c', '2026-01-03T10:00:00.000Z', 42, [10]),
    ];
    const timeline = slotTimeline(sessions, slot, {
      id: 'b',
      createdAt: '2026-01-02T10:00:00.000Z',
    });
    expect(timeline.map((i) => i.sessionId)).toEqual(['a']);
  });

  it('excludes sessions at or before resetAt', () => {
    const sessions = [
      sessionWith('a', '2026-01-01T10:00:00.000Z', 40, [10]),
      sessionWith('b', '2026-01-02T10:00:00.000Z', 41, [10]),
      sessionWith('c', '2026-01-03T10:00:00.000Z', 42, [10]),
    ];
    const reset = makeSlot({ resetAt: '2026-01-02T10:00:00.000Z' });
    expect(slotTimeline(sessions, reset).map((i) => i.sessionId)).toEqual(['c']);
  });

  it('ignores other slots, replaced entries and entries without work', () => {
    const sessions = [
      sessionWith('a', '2026-01-01T10:00:00.000Z', 40, [10], { slotUid: 'other' }),
      sessionWith('b', '2026-01-02T10:00:00.000Z', 41, [10], { replacesSlotUid: 'slot1' }),
      sessionWith('c', '2026-01-03T10:00:00.000Z', 43, [null]),
    ];
    expect(slotTimeline(sessions, slot)).toEqual([]);
  });

  it('keeps the same entries as slotHistory over any set of sessions', () => {
    assert(
      property(
        array(integer({ min: 0, max: 20 }), { maxLength: 10 }),
        integer({ min: 0, max: 20 }),
        (days, resetDay) => {
          const sessions = days.map((d, i) =>
            sessionWith(
              `s${i}`,
              new Date(Date.UTC(2026, 0, 1 + d)).toISOString(),
              40 + i,
              d % 3 === 0 ? [null] : [10],
              { slotUid: d % 5 === 0 ? 'other' : 'slot1' },
            ),
          );
          const reset = makeSlot({
            resetAt: new Date(Date.UTC(2026, 0, 1 + resetDay)).toISOString(),
          });
          const current = sessions[0];
          for (const s of [slot, reset]) {
            expect(slotHistory(sessions, s, current)).toEqual(
              slotTimeline(sessions, s, current).map((i) => i.entry),
            );
          }
        },
      ),
    );
  });
});
