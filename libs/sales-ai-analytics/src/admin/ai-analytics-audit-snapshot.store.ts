import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { AiEntityDto, AiService } from '@lib/call-lib';
import {
    AI_ANALYTICS_AUDIT_APP,
    AI_ANALYTICS_AUDIT_LOOKBACK_DAYS,
    AI_ANALYTICS_AUDIT_PROVIDER,
    AI_ANALYTICS_AUDIT_TYPE,
    AiAnalyticsAuditSnapshotPayload,
    parseAuditSnapshotPayload,
} from '../contracts/audit-snapshot.types';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AiAnalyticsAuditSnapshotInput {
    domain: string;
    /** Markdown отчёта — колонка result. */
    markdown: string;
    payload: AiAnalyticsAuditSnapshotPayload;
}

/** Снапшот, прочитанный из ais. */
export interface AiAnalyticsAuditSnapshotRecord
    extends AiAnalyticsAuditSnapshotPayload {
    id: string;
    createdAt: Date;
    markdown: string;
}

/**
 * Снапшоты аудита данных AI-аналитики в таблице ais (контракт
 * audit-snapshot.types): одна запись на запуск, result — markdown,
 * user_result — отчёт и параметры. Читается последняя запись типа за
 * AI_ANALYTICS_AUDIT_LOOKBACK_DAYS дней (findByDomainTypesInPeriod
 * фильтрует по created_at, другого индекса у ais нет).
 */
@Injectable()
export class AiAnalyticsAuditSnapshotStore {
    constructor(private readonly aiService: AiService) {}

    /** Пишет снапшот, возвращает id ais-записи. */
    async save(input: AiAnalyticsAuditSnapshotInput): Promise<string> {
        const created = await this.aiService.create({
            provider: AI_ANALYTICS_AUDIT_PROVIDER,
            app: AI_ANALYTICS_AUDIT_APP,
            type: AI_ANALYTICS_AUDIT_TYPE,
            status: 'done',
            result: input.markdown,
            user_result: JSON.parse(
                JSON.stringify(input.payload),
            ) as Prisma.JsonValue,
            domain: input.domain,
        });
        return created.id;
    }

    /**
     * Последний по created_at снапшот домена за окно поиска; null — нет ни
     * одной записи распознаваемой формы. Верхняя граница — сутки вперёд:
     * created_at ставит БД, и её часы могут чуть опережать приложение.
     */
    async latest(
        domain: string,
        now: Date = new Date(),
    ): Promise<AiAnalyticsAuditSnapshotRecord | null> {
        const from = new Date(
            now.getTime() - AI_ANALYTICS_AUDIT_LOOKBACK_DAYS * DAY_MS,
        );
        const to = new Date(now.getTime() + DAY_MS);
        const records = await this.aiService.findByDomainTypesInPeriod(
            domain,
            [AI_ANALYTICS_AUDIT_TYPE],
            from,
            to,
        );
        const parsed = records
            .flatMap(record => this.toRecord(record))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return parsed[0] ?? null;
    }

    private toRecord(record: AiEntityDto): AiAnalyticsAuditSnapshotRecord[] {
        const payload = parseAuditSnapshotPayload(record.user_result);
        if (!payload) return [];
        return [
            {
                id: record.id,
                createdAt: record.createdAt,
                markdown: record.result,
                ...payload,
            },
        ];
    }
}
