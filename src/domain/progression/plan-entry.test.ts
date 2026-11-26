import { makeExercise, makeSlot, sessionWith } from '../builders.fixtures';
import { planEntry } from './plan-entry';

const exercise = makeExercise({ increment: 2.5 });
const sessions = [sessionWith('a', '2026-01-01T10:00:00.000Z', 40, [12, 12, 12])];
const current = { id: 'now', createdAt: '2026-01-05T10:00:00.000Z' };
const base = { exercise, sessions, current, deload: false };

describe('planEntry', () => {
  it('plans double progression from the slot history', () => {
    const { sets, info } = planEntry({ ...base, slot: makeSlot({ mode: 'range' }) });
    expect(sets).toHaveLength(3);
    expect(sets[0]).toEqual({ type: 'work', targetKg: 42.5, targetReps: '10–12' });
    expect(info).toEqual({ mode: 'range' });
  });

  it('plans a linear slot', () => {
    const slot = makeSlot({ mode: 'linear', repMin: 5, repMax: 5, kg: 60 });
    const { sets, info } = planEntry({ ...base, slot, sessions: [] });
    expect(sets[0]?.targetKg).toBe(60);
    expect(info.mode).toBe('linear');
  });

  it('plans a wave slot using the session count as n', () => {
    const slot = makeSlot({ mode: 'wave', weeks: '3x5@60\n3x5@65', increment: 5 });
    const { sets, info } = planEntry({ ...base, slot });
    expect(sets.map((s) => s.targetKg)).toEqual([65, 65, 65]);
    expect(info).toMatchObject({ mode: 'wave', week: 1, cycle: 0 });
  });

  it('passes the deload flag to the wave', () => {
    const slot = makeSlot({ mode: 'wave', weeks: '3x5@60\n3x5@50' });
    const { sets } = planEntry({ ...base, slot, sessions: [], deload: true });
    expect(sets[0]?.targetKg).toBe(50);
  });

  it('plans a free slot with the slot weight', () => {
    const slot = makeSlot({ mode: 'free', kg: 30, sets: 2, repMin: 8, repMax: 8 });
    const { sets, info } = planEntry({ ...base, slot });
    expect(sets).toEqual([
      { type: 'work', targetKg: 30, targetReps: '8' },
      { type: 'work', targetKg: 30, targetReps: '8' },
    ]);
    expect(info).toEqual({ mode: 'free' });
  });

  it('falls back to a free plan when the weeks are invalid', () => {
    const slot = makeSlot({ mode: 'wave', weeks: 'nope', kg: 30 });
    const { sets, info } = planEntry({ ...base, slot });
    expect(sets).toHaveLength(3);
    expect(sets.every((s) => s.type === 'work' && s.targetKg === 30)).toBe(true);
    expect(info).toMatchObject({ mode: 'wave', invalidWeeks: true });
  });

  it('puts warm-ups first, based on the heaviest work or control weight', () => {
    const slot = makeSlot({ mode: 'wave', weeks: '1xmáx@87.5 + 2x5@65', warmup: 'full' });
    const { sets } = planEntry({ ...base, slot, sessions: [] });
    const kinds = sets.map((s) => s.type);
    expect(kinds).toEqual(['warmup', 'warmup', 'warmup', 'warmup', 'control', 'work', 'work']);
    expect(sets[0]).toEqual({ type: 'warmup', targetKg: 20, targetReps: '10' });
  });

  it('has no warm-ups for a free slot without weight', () => {
    const slot = makeSlot({ mode: 'free', kg: null, warmup: 'full' });
    const { sets } = planEntry({ ...base, slot });
    expect(sets.every((s) => s.type === 'work')).toBe(true);
  });

  it('ignores sessions of other slots', () => {
    const other = [
      sessionWith('a', '2026-01-01T10:00:00.000Z', 40, [12, 12, 12], { slotUid: 'other' }),
    ];
    const slot = makeSlot({ mode: 'range', kg: 40 });
    expect(planEntry({ ...base, slot, sessions: other }).sets[0]?.targetKg).toBe(40);
  });
});
