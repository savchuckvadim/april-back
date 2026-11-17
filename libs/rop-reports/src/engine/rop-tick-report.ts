import { RopPeriod } from '../period/rop-period';
import { RopRunResult } from './rop-report.definition';

/**
 * Итог тика (или ручного запуска) для технического чата Telegram —
 * обобщение итога отчёта по дублям: строка на портал и период,
 * предупреждения, ожидающие и повторяющие — одной строкой.
 */

/** Сколько предупреждений портала показывать в сообщении. */
const MAX_WARNINGS = 3;
/** Длинные тексты режем: сообщение должно читаться. */
const MAX_TEXT = 200;

/** Чем закончился портал (и период) в тике. */
export type RopTickOutcome =
    | {
          readonly kind: 'ran';
          readonly domain: string;
          readonly period: RopPeriod;
          readonly result: RopRunResult;
      }
    /** Ни один период портала ещё не пора выпускать или уже выпущен. */
    | { readonly kind: 'waiting'; readonly domain: string }
    /** Портал занят другим прогоном (ручной запуск) — повтор в следующий тик. */
    | {
          readonly kind: 'busy';
          readonly domain: string;
          readonly period: RopPeriod;
      }
    | {
          readonly kind: 'failed';
          readonly domain: string;
          /** null — сбой до выбора периода (настройки, календарь). */
          readonly period: RopPeriod | null;
          readonly error: string;
          /** Номер неудачной попытки; нет — ручной запуск. */
          readonly attempt?: number;
          /** Попытки кончились: период закрыт без отчёта. */
          readonly gaveUp?: boolean;
      }
    /** Сбой повторяется: в Telegram не шлём, ждём следующий тик. */
    | {
          readonly kind: 'retrying';
          readonly domain: string;
          readonly period: RopPeriod | null;
          readonly error: string;
          readonly attempt: number;
      };

/** Шуметь ли в Telegram: только если что-то прогнано или впервые упало. */
export const shouldNotifyRopTick = (
    outcomes: readonly RopTickOutcome[],
): boolean =>
    outcomes.some(
        outcome => outcome.kind === 'ran' || outcome.kind === 'failed',
    );

const clip = (text: string): string =>
    text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;

const where = (domain: string, period: RopPeriod | null): string =>
    period ? `${domain} · ${period.label}` : domain;

const formatWarnings = (warnings: readonly string[]): string[] => {
    const lines = warnings
        .slice(0, MAX_WARNINGS)
        .map(warning => `   ⚠ ${clip(warning)}`);
    const hidden = warnings.length - MAX_WARNINGS;
    if (hidden > 0) lines.push(`   … и ещё предупреждений: ${hidden}`);
    return lines;
};

const formatRan = (
    outcome: Extract<RopTickOutcome, { kind: 'ran' }>,
): string[] => {
    const { result } = outcome;
    const mark = result.countOnly ? '⏸' : '✅';
    const delivery = result.countOnly
        ? `только считать — задачи не ставятся (получателей было бы: ${result.recipients})`
        : `задач поставлено ${result.tasksCreated} из ${result.recipients}` +
          (result.tasksAlreadyDone
              ? `, уже стояли с прошлой попытки — ${result.tasksAlreadyDone}`
              : '') +
          `, прошлых закрыто ${result.tasksClosed}`;
    return [
        `${mark} ${where(outcome.domain, outcome.period)}`,
        ...result.summary.map(line => `   ${clip(line)}`),
        `   ${delivery}`,
        ...formatWarnings(result.warnings),
    ];
};

const formatFailed = (
    outcome: Extract<RopTickOutcome, { kind: 'failed' }>,
): string => {
    const line = `❌ ${where(outcome.domain, outcome.period)}: ошибка — ${clip(outcome.error)}`;
    if (outcome.gaveUp) {
        return `${line}\n   попыток подряд: ${outcome.attempt ?? 0} — период закрыт, отчёт не доставлен`;
    }
    return outcome.attempt
        ? `${line}\n   повторю в следующий час; новые сбои этого периода — без сообщений`
        : line;
};

/** Итог тика: заголовок отчёта, строки порталов, сводка ожидающих. */
export function formatRopTick(
    title: string,
    outcomes: readonly RopTickOutcome[],
): string {
    const lines = [`🧩 ${title}`];
    let waiting = 0;
    let busy = 0;
    let retrying = 0;
    for (const outcome of outcomes) {
        if (outcome.kind === 'ran') lines.push(...formatRan(outcome));
        if (outcome.kind === 'failed') lines.push(formatFailed(outcome));
        if (outcome.kind === 'waiting') waiting += 1;
        if (outcome.kind === 'busy') busy += 1;
        if (outcome.kind === 'retrying') retrying += 1;
    }
    if (waiting) lines.push(`⏳ ждут своего дня и часа: ${waiting}`);
    if (busy)
        lines.push(
            `⏳ заняты ручным запуском, повтор в следующий час: ${busy}`,
        );
    if (retrying) lines.push(`🔁 повторяют прогон после ошибки: ${retrying}`);
    return lines.join('\n');
}
