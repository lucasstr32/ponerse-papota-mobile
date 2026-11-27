import type {
  AdjustmentLog,
  EntryRecord,
  ExerciseInfo,
  SessionRecord,
  SetRecord,
  SlotConfig,
} from './types';

export function makeAdjustment(overrides: Partial<AdjustmentLog> = {}): AdjustmentLog {
  return {
    slotUid: 'slot1',
    sessionId: 's1',
    rule: 'up',
    offsetBefore: 0,
    offsetAfter: 0,
    accepted: true,
    ...overrides,
  };
}

export function makeExercise(overrides: Partial<ExerciseInfo> = {}): ExerciseInfo {
  return {
    id: 'ex1',
    equipment: 'barbell',
    increment: 2.5,
    unit: 'reps',
    bodyweight: false,
    fromFloor: false,
    ...overrides,
  };
}

export function makeSlot(overrides: Partial<SlotConfig> = {}): SlotConfig {
  return {
    uid: 'slot1',
    exerciseId: 'ex1',
    mode: 'range',
    sets: 3,
    repMin: 10,
    repMax: 12,
    kg: 40,
    increment: null,
    warmup: 'none',
    weeks: '',
    offsetKg: 0,
    resetAt: null,
    ...overrides,
  };
}

export function makeSet(overrides: Partial<SetRecord> = {}): SetRecord {
  return {
    type: 'work',
    targetKg: null,
    targetReps: '',
    kg: null,
    reps: null,
    rir: null,
    done: true,
    failed: false,
    ...overrides,
  };
}

/** Work sets with the same weight and the given reps, one per rep count. */
export function workSetsOf(kg: number | null, reps: (number | null)[]): SetRecord[] {
  return reps.map((r) => makeSet({ kg, reps: r }));
}

export function makeEntry(overrides: Partial<EntryRecord> = {}): EntryRecord {
  return {
    slotUid: 'slot1',
    replacesSlotUid: null,
    exerciseId: 'ex1',
    sets: [],
    ...overrides,
  };
}

export function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 's1',
    createdAt: '2026-01-01T10:00:00.000Z',
    entries: [],
    ...overrides,
  };
}

/** A session holding a single entry for slot1 with equal-weight work sets. */
export function sessionWith(
  id: string,
  createdAt: string,
  kg: number | null,
  reps: (number | null)[],
  entry: Partial<EntryRecord> = {},
): SessionRecord {
  return makeSession({
    id,
    createdAt,
    entries: [makeEntry({ sets: workSetsOf(kg, reps), ...entry })],
  });
}
