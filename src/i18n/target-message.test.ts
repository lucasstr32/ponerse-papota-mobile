import { assert, constant, integer, nat, oneof, property } from 'fast-check';
import type { Arbitrary } from 'fast-check';

import { makeEntry, makeExercise, makeSlot, workSetsOf } from '@/domain/builders.fixtures';
import { targetMessage } from '@/domain/target-message';
import type { TargetMessage, WaveStatus } from '@/domain/target-message';

import { fill, formatTargetMessage } from './target-message';

function wave(status: WaveStatus): TargetMessage {
  return {
    mode: 'wave',
    cycle: 0,
    week: 3,
    weeksCount: 4,
    status,
    next: { cycle: 1, week: 0, segments: [{ sets: 4, reps: '6', kg: 80 }] },
  };
}

const header = 'Ciclo 1 · semana 4/4';
const nextCycle = 'Próxima: ciclo 2 · semana 1/4 · 4 × 6 @ 80 kg';

const cases: [string, TargetMessage, string][] = [
  ['free', { mode: 'free' }, 'Sin progresión automática'],
  ['range.quality', { mode: 'range', kind: 'quality' }, 'Se progresa en calidad'],
  [
    'range.goal with one missing',
    { mode: 'range', kind: 'progress', sets: 3, reps: 12, kg: 40, missing: 1 },
    'Meta: 3 × 12 con 40 kg · falta 1 rep',
  ],
  [
    'range.goal with many missing',
    { mode: 'range', kind: 'progress', sets: 3, reps: 12, kg: 42.5, missing: 5 },
    'Meta: 3 × 12 con 42,5 kg · faltan 5 reps',
  ],
  [
    'range.goalNoKg',
    { mode: 'range', kind: 'progress', sets: 4, reps: 10, kg: null, missing: 40 },
    'Meta: 4 × 10 · faltan 40 reps',
  ],
  [
    'range.achieved',
    { mode: 'range', kind: 'achieved', kg: 42.5, reps: 10 },
    'Meta lograda · próxima: 42,5 kg × 10',
  ],
  ['range.achievedNoKg', { mode: 'range', kind: 'achieved', kg: null, reps: 10 }, 'Meta lograda'],
  [
    'range.addDifficulty',
    { mode: 'range', kind: 'addDifficulty' },
    'Meta lograda · sumá dificultad',
  ],
  [
    'linear.pending',
    { mode: 'linear', kind: 'pending', sets: 3, reps: '5', kg: 60 },
    'Objetivo: 3 × 5 @ 60 kg',
  ],
  [
    'linear.pendingNoKg',
    { mode: 'linear', kind: 'pending', sets: 3, reps: '5', kg: null },
    'Objetivo: 3 × 5',
  ],
  ['linear.achieved', { mode: 'linear', kind: 'achieved', kg: 62.5 }, 'Logrado · próxima: 62,5 kg'],
  ['linear.achievedNoKg', { mode: 'linear', kind: 'achieved', kg: null }, 'Logrado'],
  [
    'linear.firstFail',
    { mode: 'linear', kind: 'firstFail', kg: 62.5 },
    'Primer fallo · repetí 62,5 kg',
  ],
  [
    'linear.firstFailNoKg',
    { mode: 'linear', kind: 'firstFail', kg: null },
    'Primer fallo · repetí el peso',
  ],
  [
    'linear.deload',
    { mode: 'linear', kind: 'deload', kg: 57.5 },
    'Segundo fallo · la próxima baja al 90 %: 57,5 kg',
  ],
  [
    'linear.deloadNoKg',
    { mode: 'linear', kind: 'deload', kg: null },
    'Segundo fallo · la próxima baja al 90 %',
  ],
  [
    'wave.controlPending',
    wave({ kind: 'controlPending', kg: 87.5 }),
    `${header}\nSerie de control con 87,5 kg: el máximo de reps dejando 1 en reserva\n${nextCycle}`,
  ],
  [
    'wave.controlPendingNoKg',
    wave({ kind: 'controlPending', kg: null }),
    `${header}\nSerie de control: el máximo de reps dejando 1 en reserva\n${nextCycle}`,
  ],
  [
    'wave.controlDone',
    wave({ kind: 'controlDone', kg: 87.5, reps: 7, oneRm: 110.83 }),
    `${header}\nControl hecho: 87,5 kg × 7 · 1RM ≈ 111 kg\n${nextCycle}`,
  ],
  [
    'wave.controlDone rounded to half a kilo',
    wave({ kind: 'controlDone', kg: 80, reps: 5, oneRm: 105.2 }),
    `${header}\nControl hecho: 80 kg × 5 · 1RM ≈ 105 kg\n${nextCycle}`,
  ],
  [
    'wave.controlDone rounded up to half a kilo',
    wave({ kind: 'controlDone', kg: 80, reps: 6, oneRm: 105.3 }),
    `${header}\nControl hecho: 80 kg × 6 · 1RM ≈ 105,5 kg\n${nextCycle}`,
  ],
  [
    'wave.controlDoneNoEstimate',
    wave({ kind: 'controlDone', kg: 60, reps: 12, oneRm: null }),
    `${header}\nControl hecho: 60 kg × 12 · sin 1RM estimado\n${nextCycle}`,
  ],
  [
    'wave.controlDoneNoKgMany',
    wave({ kind: 'controlDone', kg: null, reps: 7, oneRm: null }),
    `${header}\nControl hecho: 7 reps · sin 1RM estimado\n${nextCycle}`,
  ],
  [
    'wave.controlDoneNoKgOne',
    wave({ kind: 'controlDone', kg: null, reps: 1, oneRm: null }),
    `${header}\nControl hecho: 1 rep · sin 1RM estimado\n${nextCycle}`,
  ],
  [
    'wave.pendingOne',
    wave({ kind: 'pending', remaining: 1 }),
    `${header}\nFalta 1 serie\n${nextCycle}`,
  ],
  [
    'wave.pendingMany',
    wave({ kind: 'pending', remaining: 3 }),
    `${header}\nFaltan 3 series\n${nextCycle}`,
  ],
  [
    'wave.notCompleted',
    wave({ kind: 'notCompleted' }),
    `${header}\nSemana no completada\n${nextCycle}`,
  ],
  ['wave.achieved', wave({ kind: 'achieved' }), `${header}\nSemana lograda\n${nextCycle}`],
  [
    'wave.extraMargin',
    wave({ kind: 'extraMargin' }),
    `${header}\nSemana lograda · te sobró margen\n${nextCycle}`,
  ],
  [
    'wave.next within the same cycle',
    {
      mode: 'wave',
      cycle: 0,
      week: 0,
      weeksCount: 4,
      status: { kind: 'achieved' },
      next: { cycle: 0, week: 1, segments: [{ sets: 4, reps: '5', kg: 80 }] },
    },
    'Ciclo 1 · semana 1/4\nSemana lograda\nPróxima: semana 2/4 · 4 × 5 @ 80 kg',
  ],
  [
    'wave.segment and segmentNoKg joined with a plus',
    {
      mode: 'wave',
      cycle: 1,
      week: 3,
      weeksCount: 4,
      status: { kind: 'achieved' },
      next: {
        cycle: 1,
        week: 0,
        segments: [
          { sets: 1, reps: 'máx', kg: null },
          { sets: 2, reps: '5', kg: 65 },
        ],
      },
    },
    'Ciclo 2 · semana 4/4\nSemana lograda\nPróxima: semana 1/4 · 1 × máx + 2 × 5 @ 65 kg',
  ],
];

describe('fill', () => {
  it('keeps a placeholder without a parameter visible', () => {
    expect(fill('Hola {name} {missing}', { name: 'x' })).toBe('Hola x {missing}');
  });
});

describe('formatTargetMessage', () => {
  it.each(cases)('writes %s', (_name, message, text) => {
    expect(formatTargetMessage(message)).toBe(text);
  });

  it('uses a decimal comma for the weights', () => {
    expect(formatTargetMessage({ mode: 'linear', kind: 'achieved', kg: 42.5 })).toContain('42,5');
  });

  it('writes the message built from the domain', () => {
    const pullups = makeExercise({ bodyweight: true });
    const slot = makeSlot({ mode: 'range', sets: 4, repMin: 6, repMax: 10, kg: null });
    const entry = makeEntry({ sets: workSetsOf(null, [10, 10, 10, 10]) });
    const message = targetMessage({
      slot,
      exercise: pullups,
      sessions: [],
      current: { id: 'now', createdAt: '2026-02-01T10:00:00.000Z' },
      deload: false,
      adjustments: [],
      entry,
    });
    expect(formatTargetMessage(message)).toContain('sumá dificultad');
  });

  describe('properties', () => {
    const kg: Arbitrary<number | null> = oneof(
      constant(null),
      integer({ min: 1, max: 400 }).map((x) => x / 2),
    );
    const status: Arbitrary<WaveStatus> = oneof(
      kg.map((k): WaveStatus => ({ kind: 'controlPending', kg: k })),
      integer({ min: 1, max: 400 }).chain((k) =>
        oneof(
          constant(null),
          integer({ min: 1, max: 4000 }).map((x) => x / 10),
        ).map((oneRm): WaveStatus => ({ kind: 'controlDone', kg: k / 2, reps: 5, oneRm })),
      ),
      integer({ min: 0, max: 15 }).map((reps): WaveStatus => ({
        kind: 'controlDone',
        kg: null,
        reps,
        oneRm: null,
      })),
      integer({ min: 1, max: 9 }).map((remaining): WaveStatus => ({ kind: 'pending', remaining })),
      constant<WaveStatus>({ kind: 'notCompleted' }),
      constant<WaveStatus>({ kind: 'achieved' }),
      constant<WaveStatus>({ kind: 'extraMargin' }),
    );
    const message: Arbitrary<TargetMessage> = oneof(
      constant<TargetMessage>({ mode: 'free' }),
      constant<TargetMessage>({ mode: 'range', kind: 'quality' }),
      constant<TargetMessage>({ mode: 'range', kind: 'addDifficulty' }),
      kg.chain((k) =>
        nat({ max: 60 }).map((missing): TargetMessage => ({
          mode: 'range',
          kind: 'progress',
          sets: 3,
          reps: 12,
          kg: k,
          missing: missing + 1,
        })),
      ),
      kg.map((k): TargetMessage => ({ mode: 'range', kind: 'achieved', kg: k, reps: 8 })),
      kg.map((k): TargetMessage => ({
        mode: 'linear',
        kind: 'pending',
        sets: 3,
        reps: '5',
        kg: k,
      })),
      kg.chain((k) =>
        oneof(
          constant<'achieved' | 'firstFail' | 'deload'>('achieved'),
          constant<'achieved' | 'firstFail' | 'deload'>('firstFail'),
          constant<'achieved' | 'firstFail' | 'deload'>('deload'),
        ).map((kind): TargetMessage => ({ mode: 'linear', kind, kg: k })),
      ),
      status.chain((s) =>
        kg.chain((k) =>
          integer({ min: 0, max: 1 }).map((jump): TargetMessage => ({
            mode: 'wave',
            cycle: 2,
            week: 1,
            weeksCount: 4,
            status: s,
            next: { cycle: 2 + jump, week: 2, segments: [{ sets: 3, reps: '5', kg: k }] },
          })),
        ),
      ),
    );

    it('never leaves a placeholder or an empty text', () => {
      assert(
        property(message, (m) => {
          const text = formatTargetMessage(m);
          expect(text.length).toBeGreaterThan(0);
          expect(text).not.toMatch(/[{}]/);
        }),
      );
    });
  });
});
