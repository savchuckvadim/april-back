/**
 * Расчёт одного месячного сегмента KPI по домену: kpi-report
 * (ReportKpiUseCase — «0 расхождений» с /kpi-report/get) + отдельный
 * strict-батч `done` по item'ам event_type для кодов, которых в отчёте нет
 * отдельной строкой (слиты в call_done).
 *
 * НЕ @Injectable: держит bitrix-инстанс домена (правило CLAUDE.md про race
 * condition) — создаётся `KpiMonthCalculator.create(domain, pbx, ids)` в
 * loader'е на один расчёт. Батч-команды копятся и отправляются на ТОМ ЖЕ
 * инстансе api; батч kpi-report живёт на своём инстансе и завершается до
 * старта per-type батча — команды не перемешиваются.
 */
import { PBXService } from '@/modules/pbx';
import { BitrixBaseApi } from '@/modules/bitrix';
import { AiAnalyticsKpiEventTypeCode } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { ReportKpiUseCase } from '../../../report';
import type { ReportGetFiltersDto } from '../../../report';
import type { ReportData } from '../../../shared/dto/kpi.dto';
import {
    assertBatchComplete,
    mergeBatchResults,
} from '../../../shared/lib/batch-completeness.util';
import { normalizeReportPeriod } from '../../../shared/lib/date-util';
import type { MonthSegment } from '../../../shared/lib/month-segments.util';
import {
    assembleKpiManagerMonth,
    buildPerTypeCommands,
    codesNeedingBatch,
    KpiCounters,
    KpiListFields,
    LISTS_ELEMENT_GET_METHOD,
    PerTypeCommand,
    resolveKpiListFields,
} from './kpi-month.assembler';
import type { AiKpiMonth } from './kpi.types';

const BATCH_CONCURRENCY = 1;
const BATCH_CONTEXT = 'AI-аналитика: факт по типам событий';

export class KpiMonthCalculator {
    private constructor(
        private readonly report: ReportKpiUseCase,
        private readonly api: BitrixBaseApi,
        private readonly fields: KpiListFields,
        private readonly managerIds: readonly number[],
    ) {}

    static async create(
        domain: string,
        pbx: PBXService,
        managerIds: readonly number[],
    ): Promise<KpiMonthCalculator> {
        const report = new ReportKpiUseCase();
        await report.init(domain, pbx);
        const { bitrix, PortalModel } = await pbx.init(domain);
        return new KpiMonthCalculator(
            report,
            bitrix.api,
            resolveKpiListFields(PortalModel),
            managerIds,
        );
    }

    async compute(segment: MonthSegment): Promise<AiKpiMonth> {
        const rows = await this.report.generateKpiReport(
            this.reportFilters(segment),
        );
        const countersByManager = this.countersByManager(rows);
        const batchDone = await this.loadPerTypeDone(segment, rows);

        return {
            month: segment.month,
            from: segment.from,
            to: segment.to,
            closed: segment.cacheable,
            fromCache: false,
            managers: this.managerIds.map(managerId =>
                assembleKpiManagerMonth(
                    managerId,
                    countersByManager.get(managerId) ?? new Map(),
                    batchDone.get(managerId) ?? new Map(),
                    this.fields,
                ),
            ),
        };
    }

    /** Фильтры kpi-report: канон YYYY-MM-DD (dateTo включительно), имена не нужны. */
    private reportFilters(segment: MonthSegment): ReportGetFiltersDto {
        return {
            dateFrom: segment.from,
            dateTo: segment.to,
            userIds: [...this.managerIds],
            departament: this.managerIds.map(id => ({
                ID: String(id),
                NAME: '',
                LAST_NAME: '',
            })),
            userFieldId: '',
            dateFieldId: '',
            actionFieldId: '',
            currentActions: {},
        };
    }

    private countersByManager(rows: ReportData[]): Map<number, KpiCounters> {
        return new Map(
            rows.map(row => [
                Number(row.id),
                new Map(row.kpi.map(kpi => [kpi.id, Number(kpi.count) || 0])),
            ]),
        );
    }

    /** Per-type `done` по кодам без строки в отчёте: strict-батч + контроль полноты. */
    private async loadPerTypeDone(
        segment: MonthSegment,
        rows: ReportData[],
    ): Promise<Map<number, Map<AiAnalyticsKpiEventTypeCode, number>>> {
        const byManager = new Map<
            number,
            Map<AiAnalyticsKpiEventTypeCode, number>
        >();
        const reportInnerCodes = new Set(
            rows.flatMap(row => row.kpi.map(kpi => kpi.id)),
        );
        const commands = buildPerTypeCommands(
            this.fields,
            this.managerIds,
            codesNeedingBatch(reportInnerCodes, this.fields),
            normalizeReportPeriod(segment.from, segment.to),
        );
        if (!commands.length) return byManager;

        for (const command of commands) {
            this.api.addCmdBatch(
                command.cmdKey,
                LISTS_ELEMENT_GET_METHOD,
                command.params,
            );
        }
        const merged = mergeBatchResults(
            await this.api.callBatchWithConcurrency(BATCH_CONCURRENCY, {
                strict: true,
            }),
        );
        assertBatchComplete(
            merged,
            commands.map(command => command.cmdKey),
            BATCH_CONTEXT,
        );

        for (const command of commands) {
            this.putDone(
                byManager,
                command,
                Number(merged.totals[command.cmdKey]),
            );
        }
        return byManager;
    }

    private putDone(
        byManager: Map<number, Map<AiAnalyticsKpiEventTypeCode, number>>,
        command: PerTypeCommand,
        total: number,
    ): void {
        const codes =
            byManager.get(command.managerId) ??
            new Map<AiAnalyticsKpiEventTypeCode, number>();
        codes.set(command.code, Number.isFinite(total) ? total : 0);
        byManager.set(command.managerId, codes);
    }
}
