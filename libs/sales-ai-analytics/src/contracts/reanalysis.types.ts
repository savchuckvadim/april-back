/**
 * Переразбор истории текущей версией промпта (план
 * ai/tasks/2026-10-19-ai-focus-plan.md, этап 1B): контракт джобы
 * `CALL_REPORT_REANALYZE`, запись-статус прогона и ключи записей.
 *
 * Это служебные записи ais, а не снапшоты витрины: в реестр
 * `AI_ANALYTICS_SNAPSHOT_TYPE` они не входят (ретенция не управляет ими,
 * хранятся бессрочно). Пишет воркер `apps/event-sales`, читают админ-ручки
 * `admin/ai-analytics/reanalyze*`. Чистые типы и функции без DI.
 */
import { JobNames } from '@lib/queue/constants/job-names.enum';

/** Тип ais-записи статуса прогона переразбора; ключ — `${from}..${to}`. */
export const CALL_REPORT_REANALYSIS_RUN_TYPE = 'call-report-reanalysis-run';

/**
 * Тип ais-записи отчёта согласия старой и новой версии промпта на парах
 * «старый разбор — переразбор»; ключ — `${старая серия}->${текущая версия}`.
 */
export const AI_ANALYTICS_VERSION_AGREEMENT_TYPE =
    'ai-analytics-version-agreement';

/** provider/agentName новых записей `agent-analysis`, созданных переразбором. */
export const REANALYSIS_PROVIDER = 'call-report-reanalyzer';

/** Режим запуска: боевой прогон или оценка без вызовов модели. */
export const REANALYSIS_MODES = ['run', 'dry-run'] as const;
export type ReanalysisMode = (typeof REANALYSIS_MODES)[number];

/** Причины пропуска звонка при отборе кандидатов. */
export const REANALYSIS_SKIP_REASONS = [
    /** Активный разбор уже текущей серии промпта. */
    'upToDate',
    /** Разбора не было вовсе (короткий/нерелевантный — заново не разбираем). */
    'noAnalysis',
    /** Сотрудник не в списке (пилот из настроек или явный userIds). */
    'notInRoster',
    /** Все записи звонка замещены, активной нет — ждём ручного разбора. */
    'noActive',
] as const;
export type ReanalysisSkipReason = (typeof REANALYSIS_SKIP_REASONS)[number];

/** Payload джобы CALL_REPORT_REANALYZE (ставит админ-ручка и сама джоба-продолжение). */
export interface ReanalysisJobData {
    domain: string;
    /** Даты портала YYYY-MM-DD, включительно. */
    from: string;
    to: string;
    /** Сотрудники; нет — пилот из настроек портала (allowedUserIds), null там = все. */
    userIds?: number[];
    /** Квота звонков на один запуск (часть); нет — REANALYSIS_DEFAULTS.quota. */
    quota?: number;
    /** Без вызовов модели: кандидаты и оценка стоимости. */
    dryRun?: boolean;
    requestedBy?: string;
    /** Номер части цепочки продолжений, с 1. */
    part?: number;
    /** IANA-пояс дат портала; нет — Europe/Moscow. */
    timeZone?: string;
}

/** Оценка стоимости прогона по недавним разборам домена с учётом токенов. */
export interface ReanalysisCostEstimate {
    /** Записей agent-analysis с tokens_count > 0, по которым считано среднее. */
    basedOnRecords: number;
    avgTokens: number | null;
    avgPrice: number | null;
    estimatedTokens: number | null;
    estimatedPrice: number | null;
    /** Человеческое пояснение («оценки нет, появится после первых разборов»). */
    message: string;
}

/** Нагрузка записи-статуса прогона (обновляется каждые N звонков). */
export interface ReanalysisRunStatus {
    domain: string;
    from: string;
    to: string;
    userIds: number[] | null;
    dryRun: boolean;
    /** Текущая версия промпта и её серия сравнимости. */
    promptVersion: string;
    series: string | null;
    part: number;
    candidates: number;
    done: number;
    failed: number;
    skipped: number;
    skippedBy: Record<ReanalysisSkipReason, number>;
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
}

export const REANALYSIS_DEFAULTS = {
    /** Квота звонков на одну часть прогона. */
    quota: 300,
    /** Бюджет времени части — 45 минут (как у test-retest). */
    timeBudgetMs: 45 * 60 * 1000,
    /** Статус обновляется каждые N обработанных звонков. */
    statusEvery: 10,
    /** Окно записей для средних токенов оценки dryRun, дней. */
    estimateLookbackDays: 30,
    /** Пояс дат портала по умолчанию. */
    timeZone: 'Europe/Moscow',
    /** Версия расчёта в колонке model записей статуса/отчёта. */
    calcVersion: 'reanalyze-1.0.0',
    app: 'call-report',
} as const;

/** Опции Bull джобы: одна попытка (повтор ставит ручка), таймаут больше бюджета. */
export const REANALYSIS_JOB_OPTIONS = {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: true,
    timeout: 60 * 60 * 1000,
} as const;

/** Ключ записи статуса — период дат портала. */
export function reanalysisRunKey(from: string, to: string): string {
    return `${from}..${to}`;
}

/** Ключ отчёта согласия версий: старая серия → текущая версия промпта. */
export function versionAgreementKey(
    fromSeries: string | null,
    toPromptVersion: string,
): string {
    return `${fromSeries ?? 'none'}->${toPromptVersion}`;
}

/**
 * jobId части прогона: домен, период, режим и номер части. Повтор того же
 * jobId Bull молча игнорирует, пока джоба живёт; завершённые удаляются
 * (removeOnComplete), поэтому повторный запуск после окончания возможен.
 */
export function reanalyzeJobId(
    data: Pick<ReanalysisJobData, 'domain' | 'from' | 'to' | 'dryRun' | 'part'>,
): string {
    const mode: ReanalysisMode = data.dryRun ? 'dry-run' : 'run';
    return `${JobNames.CALL_REPORT_REANALYZE}:${data.domain}:${data.from}:${data.to}:${mode}:part-${data.part ?? 1}`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Структурная проверка статуса прогона при чтении из ais. */
export function isReanalysisRunStatusLike(
    value: unknown,
): value is ReanalysisRunStatus {
    if (!isRecord(value)) return false;
    return (
        typeof value.domain === 'string' &&
        typeof value.from === 'string' &&
        typeof value.to === 'string' &&
        typeof value.candidates === 'number' &&
        typeof value.done === 'number' &&
        typeof value.failed === 'number' &&
        typeof value.skipped === 'number' &&
        typeof value.finished === 'boolean' &&
        typeof value.startedAt === 'string' &&
        typeof value.updatedAt === 'string'
    );
}
