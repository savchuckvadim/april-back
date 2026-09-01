import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { ColdHookBatchGroupBuffer } from '../../cold-hook/services/batch/cold-hook-batch-group-buffer';
import { EventReportContext } from '../../event-report/services/context/event-report.context';
import {
    DealFlowResult,
    EventReportDealFlowService,
} from '../../event-report/services/deal/event-report-deal-flow.service';
import { SalesPresentationDealService } from '../../event-report/services/deal/sales-presentation-deal.service';
import { SalesXoDealService } from '../../event-report/services/deal/sales-xo-deal.service';
import {
    EventReportKpiFlowService,
    KpiRowCmd,
} from '../../event-report/services/kpi-list/event-report-kpi-flow.service';
import {
    DeferredFlowStepKind,
    EnumDeferredFlowStepKind,
} from '../dto/event-report-deferred.dto';
import {
    collectDeferredBatchErrors,
    countBatchCommands,
    describeFailure,
    mapFailuresToSteps,
} from './deferred-batch-outcome.util';

/** Пустой результат deal-flow: сделки этим запросом не двигались. */
const NO_DEALS: DealFlowResult = {
    baseDealId: null,
    newPlanPresDealId: null,
    newUnplannedPresDealId: null,
};

/** Итог батчевой части досылки. */
export interface DeferredBatchOutcome {
    deals: DealFlowResult;
    /** Команды созданных строк KPI — адреса обратных ссылок смартов. */
    kpiRows: KpiRowCmd[];
    /** Склейка «флаши буфера + хвостовой вызов» — как в обычном flow. */
    batchResults: IBitrixBatchResponseResult[];
    commandsCount: number;
    /** Вид шага → причина падения. Пусто — всё исполнено. */
    failures: Map<DeferredFlowStepKind, string>;
}

/**
 * Батчевая часть досылки: движения сделок воронок «Презентации»/«ХО» и
 * записи KPI — то, на что у менеджера в браузере нет прав.
 *
 * Ядро отчёта (карточка сущности, задача, история, post-fail, связи лида,
 * возврат в ТМЦ) здесь НЕ исполняется вовсе: его уже сделал браузер, и
 * повтор был бы вторым отчётом по одному событию.
 *
 * Сделки и KPI уезжают ОДНИМ батчем — как в обычном flow, и это не
 * оптимизация: `SalesPresentationDealService` возвращает ссылку
 * `$result[set_pres_deal]`, а строки KPI по ней привязываются к только что
 * созданной сделке. Разложи их по разным батчам — ссылка повиснет.
 *
 * НЕ @Injectable: создаётся через `new` рядом с конкретным инстансом
 * Битрикса (правило CLAUDE.md про race condition между порталами).
 */
export class DeferredBatchRunner {
    private readonly logger = new Logger(DeferredBatchRunner.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    /**
     * @param kinds — какие из батчевых видов шагов исполнять. Прочие виды
     * (`side-flow`, `lead-request-sync`, `transfer-notify`) сюда не приходят.
     */
    async run(
        ctx: EventReportContext,
        kinds: ReadonlySet<DeferredFlowStepKind>,
    ): Promise<DeferredBatchOutcome> {
        const failures = new Map<DeferredFlowStepKind, string>();
        const wantsPres = kinds.has(EnumDeferredFlowStepKind.presDeals);
        const wantsXo = kinds.has(EnumDeferredFlowStepKind.xoDeals);
        const wantsKpi = kinds.has(EnumDeferredFlowStepKind.kpi);
        if (!wantsPres && !wantsXo && !wantsKpi) {
            return {
                deals: NO_DEALS,
                kpiRows: [],
                batchResults: [],
                commandsCount: 0,
                failures,
            };
        }

        const deals = this.queueDeals(ctx, wantsPres, wantsXo, failures);
        const buffer = new ColdHookBatchGroupBuffer(this.bitrix);
        const kpiRows = wantsKpi
            ? await this.queueKpi(ctx, deals, buffer, failures)
            : [];

        let batchResults: IBitrixBatchResponseResult[] = [];
        try {
            await buffer.endGroup();
            await buffer.flush();
            const tail = await this.bitrix.api.callBatchWithConcurrency(1);
            // Ответ = флаши буфера + хвостовой вызов: KPI-команд может не
            // быть вовсе, и тогда весь cmdBatch уходит именно хвостом.
            batchResults = [...buffer.getResults(), ...tail];
        } catch (error) {
            const reason = `батч досылки не отправлен: ${(error as Error).message}`;
            for (const kind of [
                EnumDeferredFlowStepKind.presDeals,
                EnumDeferredFlowStepKind.xoDeals,
                EnumDeferredFlowStepKind.kpi,
            ]) {
                if (kinds.has(kind) && !failures.has(kind)) {
                    failures.set(kind, reason);
                }
            }
            return {
                deals,
                kpiRows,
                batchResults: [],
                commandsCount: 0,
                failures,
            };
        }

        // halt=0: часть команд могла упасть — исход каждого шага решают
        // ЕГО команды, чужая ошибка шаг не роняет.
        const byStep = mapFailuresToSteps(
            collectDeferredBatchErrors(batchResults),
        );
        for (const [kind, failure] of byStep) {
            if (kinds.has(kind) && !failures.has(kind)) {
                failures.set(kind, describeFailure(failure));
            }
        }

        return {
            deals,
            kpiRows,
            batchResults,
            commandsCount: countBatchCommands(batchResults),
            failures,
        };
    }

    /**
     * Движения сделок.
     *
     * ОБА вида сразу — весь deal-композит (`EventReportDealFlowService`):
     * ровно его пропускает грубый гейт прямого пути, и внутри он связан
     * `$result`-чейнингом база → презентация → ТМЦ. База, ТМЦ и счётчик
     * переносов принадлежат ПАРЕ шагов и другого представления не имеют.
     *
     * Один вид — тонкий раскрой: браузер композит исполнил, а конкретная
     * команда упала `ACCESS_DENIED`. Тогда доезжает ровно эта воронка;
     * базовая сделка уже существует, и презентация ссылается на неё
     * реальным id из контекста.
     */
    private queueDeals(
        ctx: EventReportContext,
        wantsPres: boolean,
        wantsXo: boolean,
        failures: Map<DeferredFlowStepKind, string>,
    ): DealFlowResult {
        if (!wantsPres && !wantsXo) return NO_DEALS;

        try {
            if (wantsPres && wantsXo) {
                return new EventReportDealFlowService(
                    this.bitrix,
                    this.portal,
                ).queue(ctx);
            }
            if (!ctx.isDealFlow) {
                // Лид-only: сделки не двигаются вовсе — шаг честно исполнен
                // (делать нечего), как и в обычном flow.
                return NO_DEALS;
            }
            if (wantsPres) {
                const baseDealId = ctx.currentBaseDeal
                    ? String(ctx.currentBaseDeal.ID)
                    : null;
                const pres = new SalesPresentationDealService(
                    this.bitrix,
                    this.portal,
                ).queue(ctx, baseDealId);
                return { ...NO_DEALS, ...pres };
            }
            new SalesXoDealService(this.bitrix, this.portal).queue(ctx);
            return NO_DEALS;
        } catch (error) {
            const reason = `движения сделок не собраны: ${(error as Error).message}`;
            this.logger.warn(`[deferred] ${ctx.domain}: ${reason}`);
            if (wantsPres)
                failures.set(EnumDeferredFlowStepKind.presDeals, reason);
            if (wantsXo) failures.set(EnumDeferredFlowStepKind.xoDeals, reason);
            return NO_DEALS;
        }
    }

    /**
     * Записи KPI/History. Собственный дедуп сервиса (финалы и уникальные
     * проверяются прямым `lists.element.get`) остаётся главной защитой от
     * дублей — отметка Redis лишь экономит поход в Битрикс.
     */
    private async queueKpi(
        ctx: EventReportContext,
        deals: DealFlowResult,
        buffer: ColdHookBatchGroupBuffer,
        failures: Map<DeferredFlowStepKind, string>,
    ): Promise<KpiRowCmd[]> {
        try {
            return await new EventReportKpiFlowService(
                this.bitrix,
                this.portal,
            ).queue(ctx, deals, buffer);
        } catch (error) {
            const reason = `записи KPI не собраны: ${(error as Error).message}`;
            this.logger.warn(`[deferred] ${ctx.domain}: ${reason}`);
            failures.set(EnumDeferredFlowStepKind.kpi, reason);
            return [];
        }
    }
}
