/**
 * Сообщения в телеграм о ходе проверки повторяемости оценок (test-retest):
 * старт, каждые 50 пар и итог — чтобы прогон шёл под контролем владельца, а
 * не молча 45 минут. Отправка — через логгер с пометкой `telegram`.
 *
 * Тексты — чистые функции; `RetestProgress` не Injectable: создаётся на
 * прогон.
 */
import type { Logger } from '@nestjs/common';

/** Раз в сколько пар сообщать о ходе. */
export const RETEST_PROGRESS_EVERY_PAIRS = 50;

/** Ход прогона на текущий момент. */
export interface RetestProgressState {
    /** Звонков в выборке. */
    sampled: number;
    /** Пар «первый — второй прогон» готово. */
    pairs: number;
    /** Повторено моделью в этом запуске. */
    rerun: number;
    /** Повторов не получилось (сбой модели или пустой ответ). */
    failed: number;
    elapsedMs: number;
}

/** Итог прогона для сообщения. */
export interface RetestFinishState extends RetestProgressState {
    /** Повторы взяты из прошлых запусков. */
    reused: number;
    /** Расхождение общей оценки между прогонами, баллов шкалы 1–10; null — пар нет. */
    sigma: number | null;
    /** Время вышло раньше, чем кончилась выборка. */
    timeBudgetHit: boolean;
}

const minutes = (ms: number): string =>
    `${Math.max(1, Math.round(ms / 60_000))} мин`;

const title = (domain: string): string =>
    `🧪 Проверка повторяемости оценок ${domain}`;

export function formatRetestStart(
    domain: string,
    sampled: number,
    reused: number,
    timeBudgetMs: number,
): string {
    const again = sampled - reused;
    return (
        `${title(domain)}: старт. В выборке ${sampled} звонков, ` +
        `заново разобрать нужно ${again}` +
        (reused > 0 ? ` (${reused} уже повторены раньше)` : '') +
        `. Лимит времени — ${minutes(timeBudgetMs)}.`
    );
}

export function formatRetestProgress(
    domain: string,
    state: RetestProgressState,
): string {
    return (
        `${title(domain)}: готово пар ${state.pairs} из ${state.sampled}, ` +
        `заново разобрано ${state.rerun}, сбоев ${state.failed}, ` +
        `прошло ${minutes(state.elapsedMs)}.`
    );
}

export function formatRetestFinish(
    domain: string,
    state: RetestFinishState,
): string {
    const sigma =
        state.sigma === null
            ? 'расхождение оценок не посчитано — пар нет'
            : `расхождение общей оценки между двумя разборами — ${state.sigma
                  .toFixed(2)
                  .replace('.', ',')} балла по шкале 1–10`;
    const time = state.timeBudgetHit
        ? `Время вышло: остаток выборки (${state.sampled - state.pairs - state.failed}) доберёт следующий запуск.`
        : 'Времени хватило на всю выборку.';
    return (
        `${title(domain)}: завершена за ${minutes(state.elapsedMs)}. ` +
        `Пар ${state.pairs} из ${state.sampled}: заново разобрано ${state.rerun}, ` +
        `из прошлых запусков ${state.reused}, сбоев ${state.failed}; ${sigma}. ${time}`
    );
}

/** Отправляет сообщения о ходе прогона; о каждой полусотне пар — один раз. */
export class RetestProgress {
    private reportedPairs = 0;

    constructor(
        private readonly logger: Pick<Logger, 'log'>,
        private readonly domain: string,
    ) {}

    start(sampled: number, reused: number, timeBudgetMs: number): void {
        this.send(
            formatRetestStart(this.domain, sampled, reused, timeBudgetMs),
        );
    }

    /** Сообщает, когда число пар перешло очередную границу в 50. */
    tick(state: RetestProgressState): void {
        const step =
            Math.floor(state.pairs / RETEST_PROGRESS_EVERY_PAIRS) *
            RETEST_PROGRESS_EVERY_PAIRS;
        if (step === 0 || step <= this.reportedPairs) return;
        // Последнюю границу, совпавшую с концом выборки, закрывает итог.
        if (state.pairs >= state.sampled) return;
        this.reportedPairs = step;
        this.send(formatRetestProgress(this.domain, state));
    }

    finish(state: RetestFinishState): void {
        this.send(formatRetestFinish(this.domain, state));
    }

    private send(text: string): void {
        this.logger.log(text, { telegram: true });
    }
}
