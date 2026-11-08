import {
    AI_ANALYTICS_SNAPSHOT_APP,
    AI_ANALYTICS_SNAPSHOT_PROVIDER,
    AI_ANALYTICS_SNAPSHOT_TYPE,
} from '@lib/sales-ai-analytics';

/**
 * Константы среза «Отчёт собственнику за период» (постановка
 * ai/tasks/2026-11-06-owner-period-report.md, этап 4): кэш, очередь,
 * снапшот, тексты ошибок.
 */

/**
 * Версия формы кэша: меняется вместе с DTO отчёта. v2 (07.11.2026) —
 * неразмеченный исход больше не «отложено», плитки с цветом, словарь.
 */
export const AI_OWNER_REPORT_KEY_VERSION = 'v2' as const;

/**
 * TTL кэша: отчёт закрытого периода не меняется, пока его не пересобрали
 * (forceRefresh перезаписывает); error-конверт живёт две минуты.
 */
export const AI_OWNER_REPORT_TTL_SECONDS = {
    ready: 30 * 24 * 60 * 60,
    error: 120,
} as const;

/** Опции Bull-джобы: без ретраев, пять минут на выборку, факты и модель. */
export const AI_OWNER_REPORT_JOB_OPTIONS = {
    priority: 1,
    attempts: 1,
    timeout: 300_000,
    removeOnComplete: true,
    removeOnFail: true,
} as const;

/** ais-запись снапшота отчёта (portal; periodKey — ключ периода). */
export const AI_OWNER_REPORT_SNAPSHOT_RECORD = {
    TYPE: AI_ANALYTICS_SNAPSHOT_TYPE.ownerReport,
    APP: AI_ANALYTICS_SNAPSHOT_APP,
    PROVIDER: AI_ANALYTICS_SNAPSHOT_PROVIDER,
} as const;

/** Сколько последних снапшотов читать для списка доступных периодов. */
export const AI_OWNER_REPORT_PERIODS_LIMIT = 48;

/** Версия нагрузки снапшота: меняется вместе с формой фактов и текста. */
export const AI_OWNER_REPORT_PAYLOAD_VERSION = 'owner-report-2' as const;

export const AI_OWNER_REPORT_ERRORS = {
    periodKey:
        'Ключ периода не соответствует его виду: месяц — ГГГГ-ММ, квартал — ГГГГ-Q1…Q4, полугодие — ГГГГ-H1/H2, год — ГГГГ',
    periodOpen: 'Период ещё не закончился: отчёт строится по закрытым периодам',
    jobMissing: 'Срез отчёта собственнику не подключён в сборке приложения',
    notBuilt:
        'Отчёт за этот период ещё не собран: откройте его на витрине и дождитесь готовности',
} as const;

/** Префикс ключа подавления повторных оповещений об ошибке джобы. */
export const AI_OWNER_REPORT_ALERT_KEY_PREFIX = 'ai-owner-report' as const;
