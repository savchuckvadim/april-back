import type { OwnerReportPeriodKind } from '../model/owner-report/owner-report.types';

/**
 * Выгрузка PDF отчёта собственнику из админки (просьба владельца
 * 07.11.2026 — «кнопка: сформировать PDF и сразу скачать»). Админка ставит
 * джобу `SALES_AI_ANALYTICS_OWNER_REPORT_EXPORT` в очередь
 * `SALES_KPI_REPORT`; воркер kpi-report-sales берёт готовый снапшот (или
 * собирает отчёт), рисует PDF и кладёт его в Redis на сутки рядом с
 * состоянием. Админка читает состояние и отдаёт файл — Битрикс портала
 * админу для этого не нужен. Общий контракт обоих приложений — здесь.
 */

export interface OwnerReportExportJobData {
    domain: string;
    kind: OwnerReportPeriodKind;
    periodKey: string;
    /** Пересобрать отчёт заново (после переразбора), а не брать снапшот. */
    forceRefresh: boolean;
    requestedBy?: string;
}

export const OWNER_REPORT_EXPORT_STATUSES = [
    'queued',
    'processing',
    'ready',
    'error',
] as const;
export type OwnerReportExportStatus =
    (typeof OWNER_REPORT_EXPORT_STATUSES)[number];

/** Состояние выгрузки: без самого файла — его читают отдельной ручкой. */
export interface OwnerReportExportState {
    status: OwnerReportExportStatus;
    domain: string;
    kind: OwnerReportPeriodKind;
    periodKey: string;
    /** Имя файла готового PDF; до готовности — null. */
    filename: string | null;
    sizeBytes: number | null;
    /** Текст ошибки по-русски; null — ошибки нет. */
    message: string | null;
    /** ISO-время последней смены состояния. */
    updatedAt: string;
}

/** Сутки: PDF успевают скачать, а Redis не копит старые файлы. */
export const OWNER_REPORT_EXPORT_TTL_SECONDS = 24 * 60 * 60;

/** Сборка отчёта с моделью и PDF — до десяти минут, без ретраев. */
export const OWNER_REPORT_EXPORT_JOB_OPTIONS = {
    attempts: 1,
    timeout: 600_000,
    removeOnComplete: true,
    removeOnFail: true,
} as const;

const EXPORT_PREFIX = 'sales-ai-analytics:owner-report-export';

/** Ключ состояния выгрузки периода портала. */
export function ownerReportExportStateKey(
    domain: string,
    kind: OwnerReportPeriodKind,
    periodKey: string,
): string {
    return `${EXPORT_PREFIX}:state:${domain}:${kind}:${periodKey}`;
}

/** Ключ байтов PDF (base64) — отдельно, чтобы опрос статуса был лёгким. */
export function ownerReportExportPdfKey(
    domain: string,
    kind: OwnerReportPeriodKind,
    periodKey: string,
): string {
    return `${EXPORT_PREFIX}:pdf:${domain}:${kind}:${periodKey}`;
}

/** jobId: одна выгрузка периода портала за раз (повтор кнопки — та же джоба). */
export function ownerReportExportJobId(data: OwnerReportExportJobData): string {
    return `owner-report-export:${data.domain}:${data.kind}:${data.periodKey}`;
}

/** Разбор состояния из Redis; чужая форма — null. */
export function parseOwnerReportExportState(
    raw: string | null,
): OwnerReportExportState | null {
    if (!raw) return null;
    try {
        const value = JSON.parse(raw) as Partial<OwnerReportExportState>;
        return typeof value.status === 'string' &&
            (OWNER_REPORT_EXPORT_STATUSES as readonly string[]).includes(
                value.status,
            ) &&
            typeof value.domain === 'string'
            ? (value as OwnerReportExportState)
            : null;
    } catch {
        return null;
    }
}
