/**
 * Дописывание полей карточек разборов (смарт «AI-анализ звонков») из
 * записей ais без вызова модели: контракт джобы `CALL_REPORT_SMART_BACKFILL`,
 * запись-статус прогона и ключи записей.
 *
 * Зачем: запись полей элемента может упасть уже после того, как разбор
 * сохранён в БД (инцидент 13–30.10.2026: Битрикс отдавал лимит строки
 * безликим 400, деградация не включалась — 422 карточки остались с
 * пустыми полями разбора). Данные целы в ais, их достаточно переписать в
 * элемент. Пишет воркер `apps/event-sales`; ставят админ-ручки
 * `admin/ai-analytics/smart-backfill*` и ночной крон. Чистые типы без DI.
 */
import { JobNames } from '@lib/queue/constants/job-names.enum';
import { toPortalDate } from '../model/workdays.util';

/** Тип ais-записи статуса прогона; ключ — `${mode}:${from}..${to}`. */
export const CALL_REPORT_SMART_BACKFILL_RUN_TYPE =
    'call-report-smart-backfill-run';

/**
 * Режим отбора карточек:
 * - `period` — все активные разборы периода с элементом смарта (разовый
 *   догон после инцидента);
 * - `pending` — только те, у которых запись полей не удалась
 *   (in_report = false при наличии элемента) — ночной крон и кнопка.
 */
export const SMART_BACKFILL_MODES = ['period', 'pending'] as const;
export type SmartBackfillMode = (typeof SMART_BACKFILL_MODES)[number];

/** Кто поставил джобу. */
export const SMART_BACKFILL_SOURCES = ['admin', 'cron'] as const;
export type SmartBackfillSource = (typeof SMART_BACKFILL_SOURCES)[number];

/** Причины, по которым запись разбора не идёт в дописывание. */
export const SMART_BACKFILL_SKIP_REASONS = [
    /** У записи нет элемента смарта (смарт не стоял или элемент не создался). */
    'noSmartItem',
    /** Запись замещена переразбором — поля пишет активная запись звонка. */
    'superseded',
    /** В записи нет разбора (пустой или чужой формы user_result). */
    'noPayload',
] as const;
export type SmartBackfillSkipReason =
    (typeof SMART_BACKFILL_SKIP_REASONS)[number];

/** Payload джобы CALL_REPORT_SMART_BACKFILL (админ-ручка, крон, продолжение). */
export interface SmartBackfillJobData {
    domain: string;
    mode: SmartBackfillMode;
    /** Даты портала YYYY-MM-DD, включительно — по дате записи разбора. */
    from: string;
    to: string;
    /** Карточек на одну часть; нет — SMART_BACKFILL_DEFAULTS.quota. */
    quota?: number;
    /** Только подсчёт кандидатов, Битрикс не вызывается. */
    dryRun?: boolean;
    /** Номер части цепочки продолжений, с 1. */
    part?: number;
    /**
     * Сколько кандидатов уже пройдено предыдущими частями (режим `period`:
     * выборка там не сужается сама, в отличие от `pending`).
     */
    offset?: number;
    requestedBy?: string;
    source: SmartBackfillSource;
    /** IANA-пояс дат портала; нет — Europe/Moscow. */
    timeZone?: string;
}

/** Нагрузка записи-статуса прогона (обновляется каждые N карточек). */
export interface SmartBackfillRunStatus {
    domain: string;
    mode: SmartBackfillMode;
    from: string;
    to: string;
    dryRun: boolean;
    source: SmartBackfillSource;
    part: number;
    candidates: number;
    done: number;
    failed: number;
    /** Элемент смарта по записи не найден (удалён на портале). */
    missing: number;
    skipped: number;
    skippedBy: Record<SmartBackfillSkipReason, number>;
    startedAt: string;
    updatedAt: string;
    finished: boolean;
    lastError: string | null;
    timeBudgetHit: boolean;
    /** jobId поставленного продолжения; null — продолжение не нужно. */
    continuedWith: string | null;
}

export const SMART_BACKFILL_DEFAULTS = {
    /** Карточек на одну часть прогона: у каждой 5–8 вызовов Битрикса. */
    quota: 150,
    /** Бюджет времени части — 40 минут (таймаут джобы — час). */
    timeBudgetMs: 40 * 60 * 1000,
    /** Статус обновляется каждые N обработанных карточек. */
    statusEvery: 10,
    /** Окно крона и режима `pending`: дней назад от сегодня. */
    pendingLookbackDays: 30,
    /** Окно кнопки «за период» в админке по умолчанию: дней назад. */
    periodLookbackDays: 30,
    timeZone: 'Europe/Moscow',
    /** Версия расчёта в колонке model записи статуса. */
    calcVersion: 'smart-backfill-1.0.0',
    app: 'call-report',
} as const;

/** Опции Bull джобы: одна попытка (повтор ставит ручка или крон), таймаут больше бюджета. */
export const SMART_BACKFILL_JOB_OPTIONS = {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: true,
    timeout: 60 * 60 * 1000,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ключ записи статуса — режим и период дат портала. */
export function smartBackfillRunKey(
    mode: SmartBackfillMode,
    from: string,
    to: string,
): string {
    return `${mode}:${from}..${to}`;
}

/**
 * jobId части прогона: домен, режим, период, dryRun и номер части. Повтор
 * того же jobId Bull молча игнорирует, пока джоба живёт; завершённые
 * удаляются (removeOnComplete), поэтому повтор после окончания возможен.
 */
export function smartBackfillJobId(
    data: Pick<
        SmartBackfillJobData,
        'domain' | 'mode' | 'from' | 'to' | 'dryRun' | 'part'
    >,
): string {
    const run = data.dryRun ? 'dry-run' : 'run';
    return `${JobNames.CALL_REPORT_SMART_BACKFILL}:${data.domain}:${data.mode}:${data.from}:${data.to}:${run}:part-${data.part ?? 1}`;
}

/** Окно «последние N дней» датами портала, по сегодня включительно. */
export function smartBackfillLookbackWindow(
    now: Date,
    days: number,
    timeZone: string,
): { from: string; to: string } {
    return {
        from: toPortalDate(new Date(now.getTime() - days * DAY_MS), timeZone),
        to: toPortalDate(now, timeZone),
    };
}

export function emptySmartBackfillSkips(): Record<
    SmartBackfillSkipReason,
    number
> {
    return Object.fromEntries(
        SMART_BACKFILL_SKIP_REASONS.map(reason => [reason, 0]),
    ) as Record<SmartBackfillSkipReason, number>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Структурная проверка статуса прогона при чтении из ais. */
export function isSmartBackfillRunStatusLike(
    value: unknown,
): value is SmartBackfillRunStatus {
    if (!isRecord(value)) return false;
    return (
        typeof value.domain === 'string' &&
        (SMART_BACKFILL_MODES as readonly unknown[]).includes(value.mode) &&
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
