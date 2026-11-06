import { Injectable } from '@nestjs/common';
import type { OwnerReportPeriodKind } from '@lib/sales-ai-analytics';
import type { AiOwnerReportDto } from '../dto/ai-owner-report.dto';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import {
    AI_OWNER_REPORT_PERIODS_LIMIT,
    AI_OWNER_REPORT_SNAPSHOT_RECORD,
} from './owner-report.const';
import {
    availablePeriodKeys,
    ownerReportPayloadOf,
    toOwnerReportDto,
} from './owner-report.presenter';
import type { OwnerReportSnapshotPayload } from './owner-report.types';

/**
 * Чтение снапшотов отчёта собственнику: готовый отчёт периода и список
 * периодов, по которым отчёт уже есть. Общий для ручки (холодный кэш) и
 * джобы (список периодов в ответе).
 */
@Injectable()
export class OwnerReportSnapshotReader {
    constructor(private readonly snapshots: AiAnalyticsSnapshotStore) {}

    /** Последний снапшот периода нашей версии; нет — null. */
    async payload(
        domain: string,
        kind: OwnerReportPeriodKind,
        periodKey: string,
    ): Promise<OwnerReportSnapshotPayload | null> {
        const records = await this.snapshots.findByKeys(
            domain,
            AI_OWNER_REPORT_SNAPSHOT_RECORD.TYPE,
            { periodKeys: [periodKey], latestOnly: true },
        );
        for (const record of [...records].reverse()) {
            const payload = ownerReportPayloadOf(record);
            if (payload && payload.kind === kind) return payload;
        }
        return null;
    }

    /** Готовый отчёт периода из снапшота; нет — null. */
    async read(
        domain: string,
        kind: OwnerReportPeriodKind,
        periodKey: string,
    ): Promise<AiOwnerReportDto | null> {
        const payload = await this.payload(domain, kind, periodKey);
        if (!payload) return null;
        return toOwnerReportDto(
            payload,
            await this.availablePeriods(domain, kind),
        );
    }

    /** Ключи периодов вида kind с готовым отчётом, новые первыми. */
    async availablePeriods(
        domain: string,
        kind: OwnerReportPeriodKind,
    ): Promise<string[]> {
        const records = await this.snapshots.findByKeys(
            domain,
            AI_OWNER_REPORT_SNAPSHOT_RECORD.TYPE,
            { limit: AI_OWNER_REPORT_PERIODS_LIMIT, latestOnly: true },
        );
        return availablePeriodKeys(records, kind);
    }
}
