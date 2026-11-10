/**
 * Догон фактов v3.1 в старых разборах (этап B4 задания
 * ai/tasks/2026-11-09-ai-khvosty-zadanie.md): контракт джобы
 * `CALL_REPORT_FACTS_CATCHUP`, запись-статус прогона и ключи записей.
 *
 * Чем отличается от переразбора: модель зовётся один раз коротким
 * промптом только за фактами (исход, вид шага, темы возражений, сбои,
 * цены, допродажа, самопредставление); оценки разделов и версия промпта
 * не трогаются, новая запись разбора не создаётся — факты дописываются в
 * активную запись `agent-analysis`, а расход ложится отдельной записью
 * `agent-analysis-facts`. Служебные записи ais, не снапшоты витрины.
 * Чистые типы и функции без DI.
 */
import { JobNames } from '@lib/queue/constants/job-names.enum';
import { toPortalDate } from '../model/workdays.util';
import type { ReanalysisCostEstimate } from './reanalysis.types';

/** Тип ais-записи статуса прогона догона; ключ — `${from}..${to}`. */
export const CALL_REPORT_FACTS_CATCHUP_RUN_TYPE =
    'call-report-facts-catchup-run';

/** provider записей статуса и записей расхода `agent-analysis-facts`. */
export const FACTS_CATCHUP_PROVIDER = 'call-report-facts-catchup';

/**
 * Версия промпта догона: пишется в `user_result.factsCatchup.version`
 * разбора и в `model` записи расхода. Серии сравнимости не касается —
 * оценки разборов не меняются.
 */
export const FACTS_CATCHUP_PROMPT_VERSION = 'facts-v1-2026-11-10';

/** Группы фактов, которых может не хватать в разборе до v3.1. */
export const FACTS_CATCHUP_GROUPS = [
    /** outcome, issues, prices, upsell, nextStep.kind, objections[].topic. */
    'movement',
    /** selfIntro. */
    'form',
] as const;
export type FactsCatchupGroup = (typeof FACTS_CATCHUP_GROUPS)[number];

/** Причины пропуска звонка при отборе кандидатов. */
export const FACTS_CATCHUP_SKIP_REASONS = [
    /** Факты обеих групп уже есть (разбор v3.1 или догон уже прошёл). */
    'hasFacts',
    /** Разбора не было вовсе (короткий/нерелевантный звонок). */
    'noAnalysis',
    /** Все записи звонка замещены, активной нет. */
    'noActive',
] as const;
export type FactsCatchupSkipReason =
    (typeof FACTS_CATCHUP_SKIP_REASONS)[number];

/** Payload джобы CALL_REPORT_FACTS_CATCHUP (ставит админ-ручка и продолжение). */
export interface FactsCatchupJobData {
    domain: string;
    /** Даты портала YYYY-MM-DD, включительно. */
    from: string;
    to: string;
    /** Квота звонков на одну часть; нет — FACTS_CATCHUP_DEFAULTS.quota. */
    quota?: number;
    /** Без вызовов модели: кандидаты и оценка стоимости. */
    dryRun?: boolean;
    /** Кто поставил: ночной крон — FACTS_CATCHUP_NIGHTLY_REQUESTER. */
    requestedBy?: string;
    /** Номер части цепочки продолжений, с 1. */
    part?: number;
    /** IANA-пояс дат портала; нет — Europe/Moscow. */
    timeZone?: string;
    /**
     * Лимит в рублях на прогон (B6, ночной догон): расход считается по
     * записям расхода; достигли — новые звонки не берутся, продолжение
     * не ставится. Нет — без лимита (кнопка).
     */
    budgetRub?: number;
}

/** Нагрузка записи-статуса прогона (обновляется после каждого звонка). */
export interface FactsCatchupRunStatus {
    domain: string;
    from: string;
    to: string;
    dryRun: boolean;
    /** Версия промпта догона. */
    promptVersion: string;
    part: number;
    candidates: number;
    done: number;
    failed: number;
    skipped: number;
    skippedBy: Record<FactsCatchupSkipReason, number>;
    tokens: number;
    price: number;
    startedAt: string;
    updatedAt: string;
    finished: boolean;
    lastError: string | null;
    timeBudgetHit: boolean;
    /** jobId поставленного продолжения; null — продолжение не нужно. */
    continuedWith: string | null;
    estimate: ReanalysisCostEstimate | null;
    /** Всего звонков прогона — знаменатель «догнано N из M». */
    total: number;
    /** Чистое время обработки звонков с начала прогона, мс. */
    processingMs: number;
    /** Оценка оставшегося времени, минут; null — ещё нечем оценить. */
    etaMinutes: number | null;
    /** Сколько звонков идёт одновременно (после серии сбоев — один). */
    concurrency: number;
    /** Часть остановлена серией сбоев: прогон не закончен, нужен повтор. */
    stopped: boolean;
    /** Лимит в рублях прогона; null — без лимита. */
    budgetRub?: number | null;
    /** Прогон остановлен по лимиту в рублях: остаток — следующей ночью. */
    budgetHit?: boolean;
}

/** Метка ночного крона в `requestedBy` джобы и статуса. */
export const FACTS_CATCHUP_NIGHTLY_REQUESTER = 'nightly';

/**
 * Окно ночного догона (B6): с первого числа прошлого месяца по сегодня в
 * поясе портала — текущий и прошлый месяц одной джобой; ключ статуса
 * меняется каждую ночь, поэтому лимит в рублях считается с нуля.
 */
export function factsCatchupNightlyWindow(
    now: Date,
    timeZone: string,
): { from: string; to: string } {
    const today = toPortalDate(now, timeZone);
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7));
    const previous =
        month === 1
            ? `${year - 1}-12`
            : `${year}-${String(month - 1).padStart(2, '0')}`;
    return { from: `${previous}-01`, to: today };
}

export const FACTS_CATCHUP_DEFAULTS = {
    /** Квота звонков на одну часть прогона: вызов дешёвый, частей меньше. */
    quota: 500,
    /** Бюджет времени части — 45 минут (как у переразбора). */
    timeBudgetMs: 45 * 60 * 1000,
    /** Одновременно звонков на портал и откат на один после серии сбоев. */
    concurrency: 3,
    serialAfterFailures: 3,
    stopAfterFailures: 8,
    /** Окно записей для средних токенов оценки dryRun, дней. */
    estimateLookbackDays: 30,
    /**
     * Нет своих записей расхода — оценка по полным разборам, делённым на
     * число проходов (три фокуса и синтез): один короткий вызов за факты.
     */
    fullAnalysisCalls: 4,
    timeZone: 'Europe/Moscow',
    /** Версия расчёта в колонке model записей статуса. */
    calcVersion: 'facts-catchup-1.0.0',
    app: 'call-report',
} as const;

/** Опции Bull джобы: одна попытка (повтор ставит ручка), таймаут больше бюджета. */
export const FACTS_CATCHUP_JOB_OPTIONS = {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: true,
    timeout: 60 * 60 * 1000,
} as const;

/** Ключ записи статуса — период дат портала. */
export function factsCatchupRunKey(from: string, to: string): string {
    return `${from}..${to}`;
}

/** jobId части прогона: домен, период, режим и номер части. */
export function factsCatchupJobId(
    data: Pick<
        FactsCatchupJobData,
        'domain' | 'from' | 'to' | 'dryRun' | 'part'
    >,
): string {
    const mode = data.dryRun ? 'dry-run' : 'run';
    return `${JobNames.CALL_REPORT_FACTS_CATCHUP}:${data.domain}:${data.from}:${data.to}:${mode}:part-${data.part ?? 1}`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Структурная проверка статуса прогона при чтении из ais. */
export function isFactsCatchupRunStatusLike(
    value: unknown,
): value is FactsCatchupRunStatus {
    if (!isRecord(value)) return false;
    return (
        typeof value.domain === 'string' &&
        typeof value.from === 'string' &&
        typeof value.to === 'string' &&
        typeof value.promptVersion === 'string' &&
        typeof value.candidates === 'number' &&
        typeof value.done === 'number' &&
        typeof value.failed === 'number' &&
        typeof value.finished === 'boolean' &&
        typeof value.startedAt === 'string' &&
        typeof value.updatedAt === 'string'
    );
}
