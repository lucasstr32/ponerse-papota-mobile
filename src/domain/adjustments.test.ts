import { array, assert, boolean, constantFrom, integer, property, record } from 'fast-check';

import {
  acceptedRule,
  isMissedSet,
  parseRirTarget,
  proposeAdjustment,
  rirTargetFor,
  waveIndex,
} from './adjustments';
import {
  makeAdjustment,
  makeEntry,
  makeExercise,
  makeSession,
  makeSet,
  makeSlot,
} from './builders.fixtures';
import type { SlotHistoryItem } from './history';
import { snapKg } from './math';
import { planWave } from './progression/wave';
import { formatRepTarget } from './reps';
import type { AdjustmentLog, AdjustmentRule, BlockWeek, EntryRecord, SessionRecord } from './types';

function timelineOf(count: number): SlotHistoryItem[] {
  return Array.from({ length: count }, (_, i) => ({
    sessionId: `s${i}`,
    createdAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
    entry: makeEntry(),
  }));
}

function log(index: number, rule: AdjustmentRule, accepted = true): AdjustmentLog {
  return makeAdjustment({ sessionId: `s${index}`, rule, accepted });
}

describe('parseRirTarget', () => {
  it.each([
    ['3', 3],
    ['0', 0],
    ['1–2', 2],
    ['1-2', 2],
    [' 2 ', 2],
    ['control', null],
    ['', null],
    ['máx', null],
    ['abc', null],
  ])('reads "%s" as %s', (text, expected) => {
    expect(parseRirTarget(text)).toBe(expected);
  });

  it('takes the upper end of any range', () => {
    assert(
      property(integer({ min: 0, max: 9 }), integer({ min: 0, max: 9 }), (x, y) => {
        const a = Math.min(x, y);
        const b = Math.max(x, y);
        expect(parseRirTarget(formatRepTarget(a, b))).toBe(b);
      }),
    );
  });
});

describe('rirTargetFor', () => {
  const week = { rir: '1–2', deload: false };

  it('takes the block target in wave and linear', () => {
    expect(rirTargetFor('wave', week, '4')).toBe(2);
    expect(rirTargetFor('linear', week, null)).toBe(2);
  });

  it('gives null in wave and linear without a block, even with a slot target', () => {
    expect(rirTargetFor('wave', null, '3')).toBeNull();
    expect(rirTargetFor('linear', null, '3')).toBeNull();
  });

  it('gives null for an unreadable block target', () => {
    expect(rirTargetFor('wave', { rir: 'control', deload: false }, '3')).toBeNull();
  });

  it('takes the slot target in range and free', () => {
    expect(rirTargetFor('range', week, '3')).toBe(3);
    expect(rirTargetFor('free', null, '1–2')).toBe(2);
    expect(rirTargetFor('range', week, null)).toBeNull();
  });
});

describe('acceptedRule', () => {
  it('ignores rejected logs and logs of another slot or session', () => {
    const logs = [
      makeAdjustment({ rule: 'down', accepted: false }),
      makeAdjustment({ rule: 'down', slotUid: 'other' }),
      makeAdjustment({ rule: 'down', sessionId: 's2' }),
    ];
    expect(acceptedRule(logs, 'slot1', 's1')).toBeNull();
  });

  it('gives the accepted rule', () => {
    expect(acceptedRule([makeAdjustment({ rule: 'hold' })], 'slot1', 's1')).toBe('hold');
    expect(acceptedRule([], 'slot1', 's1')).toBeNull();
  });

  it('resolves duplicates by down, then hold, then up', () => {
    const rules = ['up', 'hold', 'down'] as const;
    const all = rules.map((rule) => makeAdjustment({ rule }));
    expect(acceptedRule(all, 'slot1', 's1')).toBe('down');
    expect(acceptedRule(all.slice(0, 2), 'slot1', 's1')).toBe('hold');
    expect(acceptedRule([...all].reverse(), 'slot1', 's1')).toBe('down');
  });
});

describe('isMissedSet', () => {
  it('flags a set marked as failed even with full reps', () => {
    expect(isMissedSet(makeSet({ targetReps: '5', reps: 5, failed: true }), 5)).toBe(true);
  });

  it('flags a set without reps', () => {
    expect(isMissedSet(makeSet({ targetReps: '5', reps: null }), 5)).toBe(true);
  });

  it('flags reps below the minimum of the target and accepts the minimum', () => {
    expect(isMissedSet(makeSet({ targetReps: '8–10', reps: 7 }), 5)).toBe(true);
    expect(isMissedSet(makeSet({ targetReps: '8–10', reps: 8 }), 5)).toBe(false);
  });

  it('treats a max set with zero reps as missed', () => {
    expect(isMissedSet(makeSet({ targetReps: 'máx', reps: 0 }), 5)).toBe(true);
    expect(isMissedSet(makeSet({ targetReps: 'máx', reps: 1 }), 5)).toBe(false);
  });

  it('falls back to the given minimum when the target is unreadable', () => {
    expect(isMissedSet(makeSet({ targetReps: '', reps: 4 }), 5)).toBe(true);
    expect(isMissedSet(makeSet({ targetReps: '', reps: 5 }), 5)).toBe(false);
  });
});

/** An entry of work sets at `kg` aimed at `target` reps, with the given reps and reserve. */
function work(
  reps: (number | null)[],
  options: { kg?: number; target?: string; rir?: number | null; failed?: boolean[] } = {},
): EntryRecord {
  const { kg = 60, target = '6', rir = null, failed = [] } = options;
  return makeEntry({
    sets: reps.map((r, i) =>
      makeSet({
        targetKg: kg,
        targetReps: target,
        kg,
        reps: r,
        rir,
        failed: failed[i] ?? false,
      }),
    ),
  });
}

function sessionOf(index: number, entry: EntryRecord): SessionRecord {
  return makeSession({
    id: `s${index}`,
    createdAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
    entries: [entry],
  });
}

describe('proposeAdjustment', () => {
  const cycleWeeks = '4x6@60\n4x5@65\n5x3@70\n1xmáx@67.5 + 2x5@52.5';
  const slot = makeSlot({ mode: 'wave', weeks: cycleWeeks, increment: 5, repMin: 3 });
  const exercise = makeExercise({ increment: 2.5 });
  const block: BlockWeek = { rir: '3', deload: false };
  const current = { id: 'now', createdAt: '2026-02-01T10:00:00.000Z' };
  const reserve = work([6, 6, 6, 6], { rir: 5 });
  const base = { slot, exercise, sessions: [], current, adjustments: [], blockWeek: block };

  /** Two sessions done in weeks 1 and 2, then a missed week 3 at 70 kg. */
  function missedWeekThree(): SessionRecord[] {
    return [
      sessionOf(0, work([6, 6, 6, 6])),
      sessionOf(1, work([5, 5, 5, 5], { kg: 65, target: '5' })),
      sessionOf(2, work([3, 3, 3, 2, 2], { kg: 70, target: '3' })),
    ];
  }
  const missedNow = work([3, 3, 2, 2, 2], { kg: 70, target: '3' });
  const holdOnThird = makeAdjustment({ sessionId: 's2', rule: 'hold' });

  /** The same cycle with the last week free of max sets, so the fourth week proposes too. */
  const plain = makeSlot({ ...slot, weeks: '4x6@60\n4x5@65\n5x3@70\n3x3@72.5' });

  const squat = makeSlot({
    mode: 'wave',
    weeks: '4x6@75\n4x5@80\n5x3@87.5\n1xmáx@87.5 + 2x5@65',
    increment: 5,
    repMin: 3,
  });
  const squatReserve = work([6, 6, 6, 6], { kg: 75, rir: 5 });

  it('proposes raising the offset by the increment when every set had two extra reps in reserve', () => {
    expect(proposeAdjustment({ ...base, slot: squat, entry: squatReserve })).toEqual({
      rule: 'up',
      reason: 'extraReserve',
      offsetBefore: 0,
      offsetAfter: 5,
    });
  });

  it('adds the increment to the current offset', () => {
    const result = proposeAdjustment({
      ...base,
      slot: makeSlot({ ...squat, offsetKg: 2.5 }),
      entry: squatReserve,
    });
    expect(result).toMatchObject({ rule: 'up', offsetBefore: 2.5, offsetAfter: 7.5 });
  });

  it('uses the exercise increment when the slot has none', () => {
    const result = proposeAdjustment({
      ...base,
      slot: makeSlot({ ...squat, increment: null }),
      entry: squatReserve,
    });
    expect(result).toMatchObject({ rule: 'up', offsetAfter: 2.5 });
  });

  it('proposes a ten percent deload after two missed sessions', () => {
    const result = proposeAdjustment({
      ...base,
      sessions: missedWeekThree(),
      adjustments: [holdOnThird],
      entry: missedNow,
    });
    expect(result).toEqual({
      rule: 'down',
      reason: 'missedTwice',
      offsetBefore: 0,
      offsetAfter: -7.5,
    });
  });

  it('includes the cycle raise in the weight of the deload', () => {
    // Base 60 and increment 5 in the second cycle: the week weighs 65, so ninety percent
    // lands on 57.5 (offset -7.5). Without the raise it would weigh 60 and give -5.
    const twoWeeks = makeSlot({ ...slot, weeks: '3x5@60\n3x5@60', offsetKg: 0 });
    const sessions = [
      sessionOf(0, work([5, 5, 5], { kg: 60, target: '5' })),
      sessionOf(1, work([5, 5, 5], { kg: 60, target: '5' })),
      sessionOf(2, work([5, 4, 4], { kg: 65, target: '5' })),
    ];
    const result = proposeAdjustment({
      ...base,
      slot: twoWeeks,
      sessions,
      adjustments: [makeAdjustment({ sessionId: 's2', rule: 'hold' })],
      entry: work([5, 4, 4], { kg: 65, target: '5' }),
    });
    expect(result).toMatchObject({ rule: 'down', offsetBefore: 0, offsetAfter: -7.5 });
    expect(snapKg(65 + (result?.offsetAfter ?? 0))).toBe(57.5);
  });

  it('does not take the current session saved among the sessions as the previous one', () => {
    const wellDone = [
      ...missedWeekThree().slice(0, 2),
      sessionOf(2, work([3, 3, 3, 3, 3], { kg: 70, target: '3' })),
    ];
    const saved = makeSession({
      id: current.id,
      createdAt: current.createdAt,
      entries: [missedNow],
    });
    const result = proposeAdjustment({
      ...base,
      slot: plain,
      sessions: [...wellDone, saved],
      entry: missedNow,
    });
    expect(result?.rule).toBe('hold');
  });

  it('proposes nothing for an entry of another slot', () => {
    expect(
      proposeAdjustment({
        ...base,
        slot: squat,
        entry: makeEntry({ ...squatReserve, slotUid: 'other' }),
      }),
    ).toBeNull();
  });

  it('holds on the first missed session', () => {
    const result = proposeAdjustment({ ...base, entry: missedNow });
    expect(result).toEqual({
      rule: 'hold',
      reason: 'missedReps',
      offsetBefore: 0,
      offsetAfter: 0,
    });
  });

  it('holds when a set was marked as failed with full reps', () => {
    const entry = work([6, 6, 6, 6], { failed: [false, true, false, false], rir: 5 });
    expect(proposeAdjustment({ ...base, entry })?.rule).toBe('hold');
  });

  it('holds when a set has no reps', () => {
    expect(proposeAdjustment({ ...base, entry: work([6, 6, 6, null], { rir: 5 }) })?.rule).toBe(
      'hold',
    );
  });

  it('holds with no reserve left on a set even when the reps were met', () => {
    const entry = work([6, 6, 6, 6], { rir: 0 });
    expect(proposeAdjustment({ ...base, entry })).toMatchObject({
      rule: 'hold',
      reason: 'rirZero',
    });
  });

  it('proposes nothing with one extra rep in reserve', () => {
    expect(proposeAdjustment({ ...base, entry: work([6, 6, 6, 6], { rir: 4 }) })).toBeNull();
  });

  it('does not raise when a set has no reserve recorded', () => {
    const entry = makeEntry({
      sets: [5, null].map((rir) => makeSet({ targetReps: '6', kg: 60, reps: 6, rir })),
    });
    expect(proposeAdjustment({ ...base, entry })).toBeNull();
  });

  it('counts a max set as work', () => {
    const entry = makeEntry({
      sets: [makeSet({ type: 'control', targetReps: 'máx', kg: 67.5, reps: 0, rir: 0 })],
    });
    expect(proposeAdjustment({ ...base, entry })?.rule).toBe('hold');
  });

  it('ignores warm-up sets', () => {
    const entry = makeEntry({
      sets: [makeSet({ type: 'warmup', targetReps: '6', reps: 0, rir: 0 }), ...reserve.sets],
    });
    expect(proposeAdjustment({ ...base, entry })?.rule).toBe('up');
  });

  it('proposes nothing for range and free slots', () => {
    for (const mode of ['range', 'free'] as const) {
      expect(
        proposeAdjustment({ ...base, slot: makeSlot({ ...slot, mode }), entry: reserve }),
      ).toBeNull();
    }
  });

  it('proposes nothing in a deload week or with an unreadable reserve target', () => {
    expect(
      proposeAdjustment({ ...base, blockWeek: { rir: '3', deload: true }, entry: reserve }),
    ).toBeNull();
    expect(
      proposeAdjustment({
        ...base,
        blockWeek: { rir: 'control', deload: false },
        entry: missedNow,
      }),
    ).toBeNull();
  });

  it('proposes nothing for a replaced entry or an entry without work sets', () => {
    expect(
      proposeAdjustment({ ...base, entry: makeEntry({ ...reserve, replacesSlotUid: 'other' }) }),
    ).toBeNull();
    expect(proposeAdjustment({ ...base, entry: makeEntry() })).toBeNull();
    expect(
      proposeAdjustment({
        ...base,
        entry: makeEntry({ sets: [makeSet({ type: 'warmup', reps: 5 })] }),
      }),
    ).toBeNull();
  });

  it('holds and downs but never raises without a block', () => {
    const open = { ...base, blockWeek: null };
    expect(proposeAdjustment({ ...open, entry: reserve })).toBeNull();
    expect(proposeAdjustment({ ...open, entry: missedNow })?.rule).toBe('hold');
    expect(
      proposeAdjustment({
        ...open,
        sessions: missedWeekThree(),
        adjustments: [holdOnThird],
        entry: missedNow,
      })?.rule,
    ).toBe('down');
  });

  it('holds when two sessions failed on a week set only in percentages', () => {
    const percent = makeSlot({ ...slot, weeks: '3x5@80%\n3x5@85%' });
    const sessions = [sessionOf(0, work([4, 4, 4], { target: '5' }))];
    const result = proposeAdjustment({
      ...base,
      slot: percent,
      sessions,
      entry: work([4, 4, 4], { target: '5' }),
    });
    expect(result?.rule).toBe('hold');
  });

  it('proposes nothing when the weeks are invalid', () => {
    const invalid = makeSlot({ ...slot, weeks: 'nada' });
    const sessions = [sessionOf(0, work([4, 4, 4], { target: '5' }))];
    for (const entry of [work([4, 4, 4], { target: '5' }), reserve]) {
      expect(proposeAdjustment({ ...base, slot: invalid, sessions, entry })).toBeNull();
    }
  });

  it('proposes nothing in a week with a max set, with or without a block', () => {
    const control = makeSlot({ ...slot, weeks: '1xmáx@67.5 + 2x5@52.5' });
    for (const entry of [reserve, missedNow]) {
      for (const blockWeek of [block, null]) {
        expect(proposeAdjustment({ ...base, slot: control, blockWeek, entry })).toBeNull();
      }
    }
  });

  it('proposes nothing in the week with a max set of a longer cycle, but does before it', () => {
    const open = { ...base, blockWeek: null };
    const sessions = missedWeekThree();
    expect(proposeAdjustment({ ...open, sessions, entry: missedNow })).toBeNull();
    expect(
      proposeAdjustment({ ...open, sessions: sessions.slice(0, 2), entry: missedNow })?.rule,
    ).toBe('hold');
  });

  describe('streak of missed sessions', () => {
    it('holds on the first miss after an accepted down', () => {
      const adjustments = [
        holdOnThird,
        makeAdjustment({ sessionId: 's3', rule: 'down', offsetAfter: -7.5 }),
      ];
      const sessions = [...missedWeekThree(), sessionOf(3, missedNow)];
      const result = proposeAdjustment({
        ...base,
        slot: makeSlot({ ...slot, offsetKg: -7.5 }),
        sessions,
        adjustments,
        entry: work([3, 3, 2, 2, 2], { kg: 62.5, target: '3' }),
      });
      expect(result?.rule).toBe('hold');
    });

    it('does not cut the streak with a rejected down, so the third miss downs again', () => {
      const adjustments = [
        holdOnThird,
        makeAdjustment({ sessionId: 's3', rule: 'down', accepted: false, offsetAfter: -7.5 }),
      ];
      const sessions = [...missedWeekThree(), sessionOf(3, missedNow)];
      const result = proposeAdjustment({
        ...base,
        slot: plain,
        sessions,
        adjustments,
        entry: missedNow,
      });
      // The rejected down still advances the week: the slot is on the fourth week, 72.5 kg,
      // and ninety percent of it rounds to 65, so the offset is -7.5.
      expect(result).toMatchObject({ rule: 'down', offsetBefore: 0, offsetAfter: -7.5 });
    });

    it('does not down after a session that went well', () => {
      const sessions = [
        ...missedWeekThree().slice(0, 2),
        sessionOf(2, work([3, 3, 3, 3, 3], { kg: 70, target: '3' })),
      ];
      expect(proposeAdjustment({ ...base, slot: plain, sessions, entry: missedNow })?.rule).toBe(
        'hold',
      );
    });
  });

  describe('linear slots', () => {
    const linear = makeSlot({ mode: 'linear', sets: 4, repMin: 6, repMax: 6, kg: 60 });
    const lin = { ...base, slot: linear };

    it('proposes only a raise', () => {
      expect(proposeAdjustment({ ...lin, entry: reserve })).toEqual({
        rule: 'up',
        reason: 'extraReserve',
        offsetBefore: 0,
        offsetAfter: 2.5,
      });
    });

    it('proposes nothing after misses, even two in a row', () => {
      const sessions = [sessionOf(0, missedNow)];
      expect(proposeAdjustment({ ...lin, sessions, entry: missedNow })).toBeNull();
    });

    it('proposes nothing when the session was not achieved, however much reserve there was', () => {
      const underTarget = makeEntry({
        sets: [5, 5, 5, 5].map((rir) =>
          makeSet({ targetKg: 60, targetReps: '6', kg: 55, reps: 6, rir }),
        ),
      });
      expect(proposeAdjustment({ ...lin, entry: underTarget })).toBeNull();
    });

    it('proposes a raise when nothing was loaded but the reps and reserve are there', () => {
      const unloaded = makeEntry({
        sets: [5, 5, 5, 5].map((rir) =>
          makeSet({ targetKg: 60, targetReps: '6', kg: null, reps: 6, rir }),
        ),
      });
      expect(proposeAdjustment({ ...lin, entry: unloaded })?.rule).toBe('up');
    });

    it('proposes nothing with no reserve at all or without a block', () => {
      expect(proposeAdjustment({ ...lin, entry: work([6, 6, 6, 6], { rir: 0 }) })).toBeNull();
      expect(proposeAdjustment({ ...lin, blockWeek: null, entry: reserve })).toBeNull();
    });
  });

  describe('properties', () => {
    const setSpec = record({
      reps: integer({ min: 0, max: 8 }),
      rir: constantFrom<number | null>(null, 0, 1, 2, 3, 4, 5, 6),
      failed: boolean(),
    });
    const entryArb = array(setSpec, { minLength: 1, maxLength: 6 }).map((specs) =>
      makeEntry({
        sets: specs.map((s) =>
          makeSet({
            targetKg: 60,
            targetReps: '6',
            kg: 60,
            reps: s.reps,
            rir: s.rir,
            failed: s.failed,
          }),
        ),
      }),
    );
    const modeArb = constantFrom('wave' as const, 'linear' as const);
    const historyArb = array(entryArb, { maxLength: 3 });

    it('never holds or downs in linear', () => {
      assert(
        property(entryArb, historyArb, (entry, history) => {
          const linear = makeSlot({ mode: 'linear', weeks: '', repMin: 6, repMax: 6 });
          const sessions = history.map((e, i) => sessionOf(i, e));
          const result = proposeAdjustment({ ...base, slot: linear, sessions, entry });
          expect(result === null || result.rule === 'up').toBe(true);
        }),
      );
    });

    it('never raises when a set was missed', () => {
      assert(
        property(modeArb, entryArb, (mode, entry) => {
          const result = proposeAdjustment({ ...base, slot: makeSlot({ ...slot, mode }), entry });
          const missed = entry.sets.some((s) => isMissedSet(s, 6));
          if (missed) expect(result?.rule).not.toBe('up');
        }),
      );
    });

    it('raises by the increment, holds in place and downs to a multiple of 2.5', () => {
      const offsets = integer({ min: -4, max: 4 }).map((k) => k * 2.5);
      assert(
        property(modeArb, offsets, entryArb, historyArb, (mode, offset, entry, history) => {
          const shifted = makeSlot({ ...slot, mode, offsetKg: offset });
          const sessions = history.map((e, i) => sessionOf(i, e));
          const result = proposeAdjustment({ ...base, slot: shifted, sessions, entry });
          if (result === null) return;
          expect(result.offsetBefore).toBe(offset);
          if (result.rule === 'up') {
            expect(result.offsetAfter - result.offsetBefore).toBeCloseTo(5, 9);
          } else if (result.rule === 'hold') {
            expect(result.offsetAfter).toBe(result.offsetBefore);
          } else {
            const timeline = sessions.map((s) => ({
              sessionId: s.id,
              createdAt: s.createdAt,
              entry: s.entries[0] ?? makeEntry(),
            }));
            const n = waveIndex(shifted.uid, timeline, []);
            const planned = planWave({ ...shifted, offsetKg: 0 }, exercise, n, { deload: false });
            const peso = Math.max(...planned.sets.map((s) => s.targetKg ?? 0));
            const total = snapKg(peso + result.offsetAfter);
            expect(Math.abs(total / 2.5 - Math.round(total / 2.5))).toBeLessThan(1e-9);
            expect(Math.abs(total - 0.9 * (peso + offset))).toBeLessThanOrEqual(1.25 + 1e-9);
          }
        }),
      );
    });
  });
});

describe('waveIndex', () => {
  const uid = 'slot1';

  it('is the number of sessions without logs', () => {
    expect(waveIndex(uid, timelineOf(5), [])).toBe(5);
    expect(waveIndex(uid, [], [])).toBe(0);
  });

  it('does not count a session that was held', () => {
    expect(waveIndex(uid, timelineOf(3), [log(1, 'hold')])).toBe(2);
  });

  it('counts a session that was raised', () => {
    expect(waveIndex(uid, timelineOf(3), [log(1, 'up')])).toBe(3);
  });

  it('repeats the week after an accepted down', () => {
    expect(waveIndex(uid, timelineOf(4), [log(3, 'down')])).toBe(3);
  });

  it('repeats the week after a down in the second cycle', () => {
    expect(waveIndex(uid, timelineOf(7), [log(6, 'down')])).toBe(6);
  });

  it('ignores rejected logs', () => {
    expect(waveIndex(uid, timelineOf(4), [log(3, 'down', false), log(1, 'hold', false)])).toBe(4);
  });

  it('ignores logs of another slot', () => {
    const other = makeAdjustment({ sessionId: 's1', rule: 'hold', slotUid: 'other' });
    expect(waveIndex(uid, timelineOf(3), [other])).toBe(3);
  });

  type Step = { rule: AdjustmentRule | null; accepted: boolean };
  const stepsOf = (rules: (AdjustmentRule | null)[]) =>
    array(record({ rule: constantFrom(...rules), accepted: boolean() }), { maxLength: 20 });
  const steps = stepsOf(['up', 'hold', 'down', null]);

  function logsOf(list: Step[]): AdjustmentLog[] {
    return list.flatMap((s, i) => (s.rule === null ? [] : [log(i, s.rule, s.accepted)]));
  }

  function indexOf(list: Step[]) {
    return waveIndex(uid, timelineOf(list.length), logsOf(list));
  }

  it('is the length without accepted logs and never above it', () => {
    assert(
      property(steps, (list) => {
        const rejected = list.map((s) => ({ ...s, accepted: false }));
        expect(indexOf(rejected)).toBe(list.length);
        expect(indexOf(list)).toBeLessThanOrEqual(list.length);
      }),
    );
  });

  it('is the length minus the accepted holds with only holds', () => {
    assert(
      property(stepsOf(['hold', null]), (list) => {
        const holds = list.filter((s) => s.rule === 'hold' && s.accepted).length;
        expect(indexOf(list)).toBe(list.length - holds);
      }),
    );
  });

  it('is the length minus the accepted holds and downs with only those', () => {
    assert(
      property(stepsOf(['hold', 'down', null]), (list) => {
        const skipped = list.filter((s) => s.rule !== null && s.accepted).length;
        expect(indexOf(list)).toBe(list.length - skipped);
      }),
    );
  });

  it('never goes down when a session is added', () => {
    assert(
      property(steps, (list) => {
        for (let i = 0; i < list.length; i++) {
          expect(indexOf(list.slice(0, i + 1))).toBeGreaterThanOrEqual(indexOf(list.slice(0, i)));
        }
      }),
    );
  });

  it('is the same after dropping the rejected logs', () => {
    assert(
      property(steps, (list) => {
        const all = logsOf(list);
        const accepted = all.filter((a) => a.accepted);
        expect(waveIndex(uid, timelineOf(list.length), accepted)).toBe(
          waveIndex(uid, timelineOf(list.length), all),
        );
      }),
    );
  });
});
