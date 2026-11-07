import type { OwnerReportPeriodKind } from '@lib/sales-ai-analytics';

/** Payload Bull-джобы SALES_AI_ANALYTICS_OWNER_REPORT_DELIVERY. */
export interface AiOwnerReportDeliveryJobData {
    domain: string;
    kind: OwnerReportPeriodKind;
    periodKey: string;
    /** День выпуска в TZ портала (для jobId и логов). */
    date: string;
    /**
     * Явные получатели (ручной запуск «отправить себе»): идут вместо
     * настроек портала, «только считать» на них не действует.
     */
    recipients?: number[];
}

export const OWNER_REPORT_DELIVERY_STATUSES = [
    'sent',
    'dry_run',
    'skipped',
    'failed',
] as const;
export type OwnerReportDeliveryStatus =
    (typeof OWNER_REPORT_DELIVERY_STATUSES)[number];

/** Причины пропуска выпуска. */
export const OWNER_REPORT_DELIVERY_REASONS = {
    aiDisabled: 'ai-analytics-disabled',
    disabled: 'disabled',
    noRecipients: 'no-recipients',
    notDelivered: 'not-delivered',
} as const;
export type OwnerReportDeliveryReason =
    (typeof OWNER_REPORT_DELIVERY_REASONS)[keyof typeof OWNER_REPORT_DELIVERY_REASONS];

export interface OwnerReportDeliveryResult {
    kind: OwnerReportPeriodKind;
    periodKey: string;
    status: OwnerReportDeliveryStatus;
    reason: OwnerReportDeliveryReason | null;
    /** Кому доставлено (Bitrix ID). */
    delivered: number[];
    /** Ссылка на PDF на Диске; null — не загружался или не загрузился. */
    fileUrl: string | null;
}

/** jobId выпуска: один на портал, вид и период. */
export const OWNER_REPORT_DELIVERY_JOB_ID_PREFIX =
    'ai-analytics:owner-report-delivery' as const;

export function buildOwnerReportDeliveryJobId(
    data: Pick<AiOwnerReportDeliveryJobData, 'domain' | 'kind' | 'periodKey'>,
): string {
    return `${OWNER_REPORT_DELIVERY_JOB_ID_PREFIX}:${data.domain}:${data.kind}:${data.periodKey}`;
}

export const OWNER_REPORT_DELIVERY_JOB_OPTIONS = {
    priority: 2,
    attempts: 1,
    timeout: 600_000,
    removeOnComplete: true,
    removeOnFail: true,
} as const;
