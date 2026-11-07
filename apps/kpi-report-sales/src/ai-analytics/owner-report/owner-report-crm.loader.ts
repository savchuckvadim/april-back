import { Injectable, Logger } from '@nestjs/common';
import type {
    OwnerReportCrmFacts,
    OwnerReportPeriodBounds,
} from '@lib/sales-ai-analytics';
import { FinanceLoader } from '../domain/loaders/finance.loader';
import { KpiLoader } from '../domain/loaders/kpi.loader';
import { PlansLoader } from '../domain/loaders/plans.loader';
import { buildOwnerReportCrmFacts } from './owner-report-crm.util';

/**
 * CRM-факты отчёта собственнику: закрытые продажи (sales-finance), KPI по
 * месяцам и планы руководителя через загрузчики вкладки AI — те же
 * месячные кэши, что у обзора (закрытые месяцы живут долго, поэтому
 * отчёт за закрытый период Битрикс почти не трогает). Каждый источник
 * fail-open: ошибка — warn и null по этому источнику, отчёт выходит с
 * тем, что есть.
 *
 * `@Injectable` без bitrix-состояния: загрузчики сами ходят через PBXService.
 */
@Injectable()
export class OwnerReportCrmLoader {
    private readonly logger = new Logger(OwnerReportCrmLoader.name);

    constructor(
        private readonly kpi: KpiLoader,
        private readonly finance: FinanceLoader,
        private readonly plans: PlansLoader,
    ) {}

    async load(
        domain: string,
        bounds: OwnerReportPeriodBounds,
        managerIds: readonly string[],
        now: Date,
    ): Promise<OwnerReportCrmFacts | null> {
        if (managerIds.length === 0) return null;
        const [kpi, finance, plans] = await Promise.all([
            this.safe(domain, 'KPI по месяцам', () =>
                this.kpi.loadKpiMonths(
                    domain,
                    bounds.from,
                    bounds.to,
                    managerIds,
                    { now },
                ),
            ),
            this.safe(domain, 'закрытые продажи', () =>
                this.finance.loadFinance(
                    domain,
                    bounds.from,
                    bounds.to,
                    managerIds,
                    { now },
                ),
            ),
            this.safe(domain, 'планы руководителя', () =>
                this.plans.loadPlans(domain, managerIds),
            ),
        ]);
        return buildOwnerReportCrmFacts({
            kpi,
            finance,
            plans,
            from: bounds.from,
            to: bounds.to,
            managerIds,
        });
    }

    private async safe<T>(
        domain: string,
        what: string,
        read: () => Promise<T>,
    ): Promise<T | null> {
        try {
            return await read();
        } catch (error) {
            this.logger.warn(
                `Отчёт собственнику ${domain}: ${what} не загружены — ${(error as Error).message}`,
            );
            return null;
        }
    }
}
