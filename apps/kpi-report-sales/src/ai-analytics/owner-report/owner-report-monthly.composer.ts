import { Injectable, Logger } from '@nestjs/common';
import {
    mergeOwnerReportFacts,
    ownerReportMonthKeys,
    previousOwnerReportPeriod,
    type OwnerReportFacts,
    type OwnerReportPeriodBounds,
} from '@lib/sales-ai-analytics';
import { OwnerReportSnapshotReader } from './owner-report-snapshot.reader';
import { OwnerReportSourcesLoader } from './owner-report-sources.loader';
import type { AiOwnerReportJobData } from './owner-report.types';

/** Вход текста отчёта: факты периода, прошлого периода и имена сотрудников. */
export interface OwnerReportInputs {
    facts: OwnerReportFacts;
    previousFacts: OwnerReportFacts | null;
    names: Record<string, string>;
}

/** Границы периода из данных джобы. */
export function ownerReportBoundsOf(
    data: AiOwnerReportJobData,
): OwnerReportPeriodBounds {
    return {
        kind: data.kind,
        periodKey: data.periodKey,
        from: data.from,
        to: data.to,
    };
}

/**
 * Сводный отчёт длинного периода (квартал, полугодие, год) из месячных
 * снапшотов — решение владельца 09.11.2026: не прямым расчётом по звонкам.
 * Факты месяцев складываются `mergeOwnerReportFacts`, прошлый период —
 * так же, если его месяцы есть. Нет снапшота хотя бы за один месяц —
 * null: джоба считает отчёт напрямую, а месяцы догоняются «Обновить всё».
 */
@Injectable()
export class OwnerReportMonthlyComposer {
    private readonly logger = new Logger(OwnerReportMonthlyComposer.name);

    constructor(
        private readonly reader: OwnerReportSnapshotReader,
        private readonly sources: OwnerReportSourcesLoader,
    ) {}

    async compose(
        data: AiOwnerReportJobData,
        now: Date,
    ): Promise<OwnerReportInputs | null> {
        if (data.kind === 'month') return null;
        const bounds = ownerReportBoundsOf(data);
        const months = await this.monthlyFacts(data.domain, bounds);
        if (!months) return null;
        const previousBounds = previousOwnerReportPeriod(bounds);
        const previousMonths = await this.monthlyFacts(
            data.domain,
            previousBounds,
        );
        const { period, previousPeriod } = await this.sources.periods(
            data.domain,
            bounds,
            previousBounds,
            now,
        );
        const facts = mergeOwnerReportFacts(months, period);
        const names = await this.sources.names(
            data.domain,
            facts.managers.map(row => row.managerId),
        );
        this.logger.log(
            `Отчёт собственнику ${data.requestKey}: сложен из ${months.length} месячных снапшотов`,
        );
        return {
            facts,
            previousFacts: previousMonths
                ? mergeOwnerReportFacts(previousMonths, previousPeriod)
                : null,
            names,
        };
    }

    /** Факты всех месяцев периода из снапшотов; хотя бы одного нет — null. */
    private async monthlyFacts(
        domain: string,
        bounds: OwnerReportPeriodBounds,
    ): Promise<OwnerReportFacts[] | null> {
        const keys = ownerReportMonthKeys(bounds);
        const payloads = await Promise.all(
            keys.map(key => this.reader.payload(domain, 'month', key)),
        );
        const missing = keys.filter((_, index) => payloads[index] === null);
        if (missing.length > 0) {
            this.logger.log(
                `Отчёт собственнику ${domain} ${bounds.periodKey}: нет месячных снапшотов за ${missing.join(', ')} — считаем напрямую по звонкам`,
            );
            return null;
        }
        return payloads.flatMap(payload => (payload ? [payload.facts] : []));
    }
}
