import type {
    NarrativeDrop,
    OwnerReportFacts,
    OwnerReportPeriodKind,
    OwnerReportText,
} from '@lib/sales-ai-analytics';
import type { AiOwnerReportDto } from '../dto/ai-owner-report.dto';

/** Payload Bull-джобы SALES_AI_ANALYTICS_OWNER_REPORT (внутренний контракт). */
export interface AiOwnerReportJobData {
    domain: string;
    kind: OwnerReportPeriodKind;
    periodKey: string;
    /** Границы периода, YYYY-MM-DD в TZ портала. */
    from: string;
    to: string;
    requestKey: string;
    forceRefresh?: boolean;
    socketId?: string;
    requesterUserId?: string;
}

/** Что сделала модель поверх шаблона: принято, отброшено, расход, причина отказа. */
export interface OwnerReportNarrativeMeta {
    version: string;
    provider: string | null;
    model: string | null;
    tokens: number | null;
    accepted: number;
    dropped: NarrativeDrop[];
    /** Почему модель не вызывалась или упала; null — вызов состоялся. */
    reason: string | null;
}

/** Нагрузка снапшота ai-analytics-owner-report. */
export interface OwnerReportSnapshotPayload {
    version: string;
    kind: OwnerReportPeriodKind;
    periodKey: string;
    from: string;
    to: string;
    generatedAt: string;
    facts: OwnerReportFacts;
    previousFacts: OwnerReportFacts | null;
    text: OwnerReportText;
    narrative: OwnerReportNarrativeMeta;
    /** Ссылки на карточки разборов по id транскрипции (только найденные). */
    links: Record<string, string>;
}

export type AiOwnerReportCacheEntry =
    | { status: 'ready'; data: AiOwnerReportDto }
    | { status: 'error'; message: string };

export interface AiOwnerReportWsDonePayload {
    requestKey: string;
    generatedAt: string;
}

export interface AiOwnerReportWsErrorPayload {
    requestKey: string;
    message: string;
}
