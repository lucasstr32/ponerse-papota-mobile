import { roundHalf } from '@/domain/math';
import { formatDecimal } from '@/domain/num';
import type { TargetMessage, TargetSegment, WaveStatus } from '@/domain/target-message';

import { strings } from './index';

const text = strings.targetMessage;

type RangeMessage = Extract<TargetMessage, { mode: 'range' }>;
type LinearMessage = Extract<TargetMessage, { mode: 'linear' }>;
type WaveMessage = Extract<TargetMessage, { mode: 'wave' }>;

/** Replaces each `{name}` in the template with the matching parameter; one without a parameter stays as written. */
export function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

function segmentText({ sets, reps, kg }: TargetSegment): string {
  return kg === null
    ? fill(text.wave.segmentNoKg, { sets, reps })
    : fill(text.wave.segment, { sets, reps, kg: formatDecimal(kg) });
}

function statusText(status: WaveStatus): string {
  switch (status.kind) {
    case 'controlPending':
      return status.kg === null
        ? text.wave.controlPendingNoKg
        : fill(text.wave.controlPending, { kg: formatDecimal(status.kg) });
    case 'controlDone': {
      if (status.kg === null) {
        return status.reps === 1
          ? text.wave.controlDoneNoKgOne
          : fill(text.wave.controlDoneNoKgMany, { reps: status.reps });
      }
      const params = { kg: formatDecimal(status.kg), reps: status.reps };
      return status.oneRm === null
        ? fill(text.wave.controlDoneNoEstimate, params)
        : fill(text.wave.controlDone, {
            ...params,
            oneRm: formatDecimal(roundHalf(status.oneRm)),
          });
    }
    case 'pending':
      return status.remaining === 1
        ? text.wave.pendingOne
        : fill(text.wave.pendingMany, { count: status.remaining });
    case 'notCompleted':
      return text.wave.notCompleted;
    case 'achieved':
      return text.wave.achieved;
    case 'extraMargin':
      return text.wave.extraMargin;
  }
}

function rangeText(message: RangeMessage): string {
  switch (message.kind) {
    case 'quality':
      return text.range.quality;
    case 'addDifficulty':
      return text.range.addDifficulty;
    case 'achieved':
      return message.kg === null
        ? text.range.achievedNoKg
        : fill(text.range.achieved, { kg: formatDecimal(message.kg), reps: message.reps });
    case 'progress': {
      const { sets, reps, kg, missing } = message;
      const goal =
        kg === null
          ? fill(text.range.goalNoKg, { sets, reps })
          : fill(text.range.goal, { sets, reps, kg: formatDecimal(kg) });
      const left =
        missing === 1 ? text.range.missingOne : fill(text.range.missingMany, { count: missing });
      return `${goal} · ${left}`;
    }
  }
}

function linearText(message: LinearMessage): string {
  if (message.kind === 'pending') {
    const { sets, reps, kg } = message;
    return kg === null
      ? fill(text.linear.pendingNoKg, { sets, reps })
      : fill(text.linear.pending, { sets, reps, kg: formatDecimal(kg) });
  }
  const { kg } = message;
  switch (message.kind) {
    case 'achieved':
      return kg === null
        ? text.linear.achievedNoKg
        : fill(text.linear.achieved, { kg: formatDecimal(kg) });
    case 'firstFail':
      return kg === null
        ? text.linear.firstFailNoKg
        : fill(text.linear.firstFail, { kg: formatDecimal(kg) });
    case 'deload':
      return kg === null
        ? text.linear.deloadNoKg
        : fill(text.linear.deload, { kg: formatDecimal(kg) });
  }
}

function waveText(message: WaveMessage): string {
  const { next, weeksCount } = message;
  const segments = next.segments.map(segmentText).join(' + ');
  const header = fill(text.wave.header, {
    cycle: message.cycle + 1,
    week: message.week + 1,
    weeks: weeksCount,
  });
  const nextLine =
    next.cycle === message.cycle
      ? fill(text.wave.next, { week: next.week + 1, weeks: weeksCount, segments })
      : fill(text.wave.nextCycle, {
          cycle: next.cycle + 1,
          week: next.week + 1,
          weeks: weeksCount,
          segments,
        });
  return [header, statusText(message.status), nextLine].join('\n');
}

/** Writes a message in Spanish. A wave takes one line each for header, state and next week. */
export function formatTargetMessage(message: TargetMessage): string {
  switch (message.mode) {
    case 'free':
      return text.free;
    case 'range':
      return rangeText(message);
    case 'linear':
      return linearText(message);
    case 'wave':
      return waveText(message);
  }
}
