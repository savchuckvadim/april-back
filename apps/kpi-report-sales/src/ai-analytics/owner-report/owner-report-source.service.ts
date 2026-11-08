import { Injectable } from '@nestjs/common';
import {
    ownerReportPeriodBounds,
    type OwnerReportPeriodKind,
} from '@lib/sales-ai-analytics';
import { OwnerReportJobUseCase } from '../domain/use-cases/owner-report-job.use-case';
import type { AiOwnerReportDto } from '../dto/ai-owner-report.dto';
import { OwnerReportSnapshotReader } from './owner-report-snapshot.reader';
import { buildOwnerReportKey } from './owner-report.cache-key.util';
import { AI_OWNER_REPORT_ERRORS } from './owner-report.const';

/** Какой отчёт нужен: портал, вид и ключ периода. */
export interface OwnerReportSourceTarget {
    domain: string;
    kind: OwnerReportPeriodKind;
    periodKey: string;
}

/**
 * Готовый отчёт периода для выпуска и выгрузки: снапшот, а если его нет
 * (или просят пересобрать после переразбора) — сборка на месте той же
 * джобой, что у витрины: она же пишет снапшот и кэш.
 */
@Injectable()
export class OwnerReportSourceService {
    constructor(
        private readonly reader: OwnerReportSnapshotReader,
        private readonly job: OwnerReportJobUseCase,
    ) {}

    async get(
        target: OwnerReportSourceTarget,
        forceRefresh: boolean,
        now = new Date(),
    ): Promise<AiOwnerReportDto> {
        if (!forceRefresh) {
            const stored = await this.reader.read(
                target.domain,
                target.kind,
                target.periodKey,
            );
            if (stored) return stored;
        }
        const bounds = ownerReportPeriodBounds(target.kind, target.periodKey);
        if (!bounds) throw new Error(AI_OWNER_REPORT_ERRORS.periodKey);
        return this.job.execute(
            {
                domain: target.domain,
                kind: target.kind,
                periodKey: target.periodKey,
                from: bounds.from,
                to: bounds.to,
                requestKey: buildOwnerReportKey(
                    target.domain,
                    target.kind,
                    target.periodKey,
                ),
            },
            now,
        );
    }
}
