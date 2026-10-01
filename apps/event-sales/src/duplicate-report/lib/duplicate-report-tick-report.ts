import { DuplicateReportRunResult } from '../types/duplicate-report.types';

/** Сколько предупреждений портала показывать в сообщении. */
const MAX_WARNINGS = 3;
/** Длинные тексты ошибок режем: сообщение в Telegram должно читаться. */
const MAX_TEXT = 200;

/** Чем закончился портал в тике крона (или ручном прогоне). */
export type DuplicateReportOutcome =
    | {
          readonly kind: 'ran';
          readonly domain: string;
          readonly result: DuplicateReportRunResult;
      }
    | { readonly kind: 'waiting'; readonly domain: string }
    | {
          readonly kind: 'failed';
          readonly domain: string;
          readonly error: string;
          /** Номер неудачной попытки недели (крон); нет — ручной прогон. */
          readonly attempt?: number;
          /** Попытки кончились: неделя закрыта без отчёта. */
          readonly gaveUp?: boolean;
      }
    /** Сбой повторяется: в Telegram не шлём, ждём следующий час. */
    | {
          readonly kind: 'retrying';
          readonly domain: string;
          readonly error: string;
          readonly attempt: number;
      };

/**
 * Слать ли итог в Telegram. Крон тикает каждый час, а отчёт уходит раз в
 * неделю: тик, где все порталы ждут своего дня или молча повторяют уже
 * известный сбой, — шум для обычного лога.
 */
export const shouldNotifyDuplicateTick = (
    outcomes: readonly DuplicateReportOutcome[],
): boolean =>
    outcomes.some(
        outcome => outcome.kind !== 'waiting' && outcome.kind !== 'retrying',
    );

/** Итог тика для технического чата: строка на портал + предупреждения. */
export const formatDuplicateReportTick = (
    outcomes: readonly DuplicateReportOutcome[],
): string => {
    const lines = ['🧩 Дубли сделок — еженедельный отчёт'];
    let waiting = 0;
    let retrying = 0;
    for (const outcome of outcomes) {
        if (outcome.kind === 'ran') lines.push(...formatRan(outcome.result));
        if (outcome.kind === 'failed') lines.push(formatFailed(outcome));
        if (outcome.kind === 'waiting') waiting += 1;
        if (outcome.kind === 'retrying') retrying += 1;
    }
    if (waiting) lines.push(`⏳ ждут своего дня и часа: ${waiting}`);
    if (retrying) lines.push(`🔁 повторяют прогон после ошибки: ${retrying}`);
    return lines.join('\n');
};

const formatFailed = (
    outcome: Extract<DuplicateReportOutcome, { kind: 'failed' }>,
): string => {
    const line = `❌ ${outcome.domain}: ошибка — ${clip(outcome.error)}`;
    if (outcome.gaveUp) {
        return `${line}
   попыток подряд: ${outcome.attempt} — отчёт этой недели пропущен`;
    }
    return outcome.attempt
        ? `${line}
   повторю в следующий час; новые сбои этой недели — без сообщений`
        : line;
};

const formatRan = (result: DuplicateReportRunResult): string[] => {
    const mark = result.countOnly ? '⏸' : '✅';
    if (!result.clients) {
        return [
            `${mark} ${result.domain}: открытых сделок ${result.scanned}, дублей нет`,
            ...formatWarnings(result.warnings),
        ];
    }
    return [
        `${mark} ${result.domain}: клиентов ${result.clients}, сделок ` +
            `${result.deals}, решить руководителю ${result.decide}, новых ` +
            `за неделю ${result.newThisWeek}`,
        result.countOnly
            ? `   только считать — файлы и задачи не создаются ` +
              `(получателей было бы: ${result.recipients})`
            : `   задач поставлено ${result.tasksCreated} из ` +
              `${result.recipients}, прошлых закрыто ${result.tasksClosed}`,
        ...formatWarnings(result.warnings),
    ];
};

const formatWarnings = (warnings: readonly string[]): string[] => {
    const lines = warnings
        .slice(0, MAX_WARNINGS)
        .map(warning => `   ⚠ ${clip(warning)}`);
    const hidden = warnings.length - MAX_WARNINGS;
    if (hidden > 0) lines.push(`   … и ещё предупреждений: ${hidden}`);
    return lines;
};

const clip = (text: string): string =>
    text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
