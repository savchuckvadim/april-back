import { Injectable } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    OWNER_REPORT_EXPORT_TTL_SECONDS,
    ownerReportExportPdfKey,
    ownerReportExportStateKey,
    parseOwnerReportExportState,
    type OwnerReportExportState,
} from '../contracts/owner-report-export.types';
import type { OwnerReportPeriodKind } from '../model/owner-report/owner-report.types';

/** Период выгрузки: портал, вид и ключ периода. */
export interface OwnerReportExportTarget {
    domain: string;
    kind: OwnerReportPeriodKind;
    periodKey: string;
}

/**
 * Хранилище выгрузки PDF отчёта собственнику в Redis — общее для админки
 * (ставит джобу, читает состояние, отдаёт файл) и воркера kpi-report-sales
 * (пишет состояние и файл). Ключи и срок жизни — в контракте; файл лежит
 * base64 отдельно от состояния, чтобы опрос статуса не тянул сотни КБ.
 */
@Injectable()
export class OwnerReportExportStore {
    constructor(private readonly redis: RedisService) {}

    async readState(
        target: OwnerReportExportTarget,
    ): Promise<OwnerReportExportState | null> {
        const raw = await this.redis
            .getClient()
            .get(
                ownerReportExportStateKey(
                    target.domain,
                    target.kind,
                    target.periodKey,
                ),
            );
        return parseOwnerReportExportState(raw);
    }

    async writeState(
        target: OwnerReportExportTarget,
        patch: Pick<OwnerReportExportState, 'status'> &
            Partial<
                Pick<
                    OwnerReportExportState,
                    'filename' | 'sizeBytes' | 'message'
                >
            >,
        now = new Date(),
    ): Promise<OwnerReportExportState> {
        const state: OwnerReportExportState = {
            domain: target.domain,
            kind: target.kind,
            periodKey: target.periodKey,
            filename: patch.filename ?? null,
            sizeBytes: patch.sizeBytes ?? null,
            message: patch.message ?? null,
            status: patch.status,
            updatedAt: now.toISOString(),
        };
        await this.redis
            .getClient()
            .set(
                ownerReportExportStateKey(
                    target.domain,
                    target.kind,
                    target.periodKey,
                ),
                JSON.stringify(state),
                'EX',
                OWNER_REPORT_EXPORT_TTL_SECONDS,
            );
        return state;
    }

    async writePdf(
        target: OwnerReportExportTarget,
        pdf: Buffer,
    ): Promise<void> {
        await this.redis
            .getClient()
            .set(
                ownerReportExportPdfKey(
                    target.domain,
                    target.kind,
                    target.periodKey,
                ),
                pdf.toString('base64'),
                'EX',
                OWNER_REPORT_EXPORT_TTL_SECONDS,
            );
    }

    /** Байты готового PDF; файла нет или срок вышел — null. */
    async readPdf(target: OwnerReportExportTarget): Promise<Buffer | null> {
        const raw = await this.redis
            .getClient()
            .get(
                ownerReportExportPdfKey(
                    target.domain,
                    target.kind,
                    target.periodKey,
                ),
            );
        return raw ? Buffer.from(raw, 'base64') : null;
    }
}
