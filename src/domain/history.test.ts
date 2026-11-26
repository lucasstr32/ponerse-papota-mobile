import { makeEntry, makeSession, makeSet, makeSlot, sessionWith } from './builders.fixtures';
import { hasWork, slotHistory, workSets } from './history';

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
