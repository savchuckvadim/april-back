import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    KpiListFlowService,
    KpiRowCmdRef,
} from '../../../shared/kpi-list-flow/services/kpi-list-flow.service';
import { EventReportContext } from '../context/event-report.context';
import { DealFlowResult } from '../deal/event-report-deal-flow.service';
import { EventReportKpiPayloadBuilder } from './event-report-kpi-payload.builder';
import { ColdHookBatchGroupBuffer } from '../../../cold-hook/services/batch/cold-hook-batch-group-buffer';
import { KpiEventPayload } from '../../../shared/kpi-list-flow/type/kpi-event-payload.type';
import {
    hasBatchRef,
    resolveBatchRefs,
} from '../../../shared/bitrix/resolve-batch-refs.util';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';

/**
 * Создаёт KPI/History элементы для всех применимых сценариев event-report.
 *
 * Реюзает {@link KpiListFlowService} из shared — он уже создаёт элементы
 * в `sales_kpi` и `sales_history` списках. Для буфера используем
 * {@link ColdHookBatchGroupBuffer} с одной группой; в event-report endpoint
 * по факту вся работа уйдёт одним batch (≤50 команд), но контракт буфера
 * сохраняем — он гарантирует целостность $result[...] ссылок.
 */
export class EventReportKpiFlowService {
    private readonly logger = new Logger(EventReportKpiFlowService.name);
    private readonly kpiFlow: KpiListFlowService;
    /** Уникальные записи, отложенные до ответа основной пачки (см. queue). */
    private readonly deferredUnique: KpiEventPayload[] = [];

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {
        this.kpiFlow = new KpiListFlowService(bitrix, portal);
    }

    /**
     * Async из-за дедуплицированных записей (финалы/уникальные): их
     * существование проверяется прямым `lists.element.get` ДО постановки
     * команд — batch-аккумулятор с `$result[...]`-ссылками при этом не
     * трогается (см. KpiListFlowService.flowDedup).
     */
    async queue(
        ctx: EventReportContext,
        deals: DealFlowResult,
        buffer: ColdHookBatchGroupBuffer,
    ): Promise<KpiRowCmd[]> {
        /*
         * Недозвон (isNoCall) КПИ НЕ пропускает — он обязан оставить след:
         * запись «Не состоялся» в sales_kpi и sales_history с привязками ко
         * всем сущностям задачи (todo2508-02 №2, в легаси так и работало —
         * BitrixListFlowService nodone → act_noresult_fail). Гейт раньше
         * глушил flow целиком, и быстрый недозвон из списка дел не оставлял
         * ни KPI, ни истории. Сделки/задачи недозвон по-прежнему не двигает —
         * их сервисы гейтятся своим isNoCall; сам builder при недозвонном
         * payload (plan неактивен, результата нет) строит ровно одну
         * отчётную запись act_noresult_fail.
         */

        const builder = new EventReportKpiPayloadBuilder(
            this.portal,
            ctx,
            deals,
        );
        const payloads = builder.buildAll();
        if (payloads.length === 0) {
            return [];
        }
        const rows: KpiRowCmd[] = [];
        for (const payload of payloads) {
            if (payload.dedup && hasBatchRef(payload.dedup.key)) {
                // Код ссылается на сделку, которую создаёт ЭТА пачка
                // (`{клиент}_$result[set_base_deal]_done`). Битрикс подставит
                // номер и отрежет хвост кода — все уникальные отчёта сольются
                // в один код (gsirk 10.11.2026). Пишем второй волной, когда
                // номер уже известен: flushDeferredUnique.
                this.deferredUnique.push(payload);
            } else if (payload.dedup) {
                // Финалы/уникальные: элемент может существовать заранее и
                // командой не создаваться — стабильного cmd в ответе батча
                // нет, ссылки сайд-очередей в них не дописываются.
                await this.kpiFlow.flowDedup(payload, buffer);
            } else {
                const refs = this.kpiFlow.flow(payload, ctx.entityId, buffer);
                for (const ref of refs) {
                    rows.push({ ...ref, scenario: payload.scenario ?? null });
                }
            }
        }
        return rows;
    }

    /**
     * Вторая волна: отложенные уникальные записи с реальными id из ответа
     * основной пачки. Зовётся ПОСЛЕ неё; отложенных нет — ни одного запроса.
     *
     * Отчёт к этому моменту уже состоялся, поэтому сбой здесь не бросается:
     * запись не удалась — предупреждение в лог, и только.
     */
    async flushDeferredUnique(
        batchResults: IBitrixBatchResponseResult[],
    ): Promise<void> {
        const pending = this.deferredUnique.splice(0);
        if (!pending.length) return;
        try {
            const buffer = new ColdHookBatchGroupBuffer(this.bitrix);
            for (const payload of pending) {
                const resolved = resolveBatchRefs(payload, batchResults);
                if (!resolved?.dedup) {
                    this.logger.warn(
                        `уникальная запись «${payload.name}» пропущена: ` +
                            `в ответе пачки нет id для ${payload.dedup?.key ?? '—'}`,
                    );
                    continue;
                }
                await this.kpiFlow.flowDedup(resolved, buffer);
            }
            await buffer.endGroup();
            await buffer.flush();
            await this.bitrix.api.callBatchWithConcurrency(1);
        } catch (error) {
            this.logger.warn(
                `уникальные записи KPI второй волной не записаны: ${(error as Error).message}`,
            );
        }
    }
}

/**
 * Команда создания строки KPI/History + сценарий записи: по сценарию
 * post-flow решает, какой элемент смарта (плановый или отчётный) должен
 * дописаться в crm-поле этой строки.
 */
export interface KpiRowCmd extends KpiRowCmdRef {
    scenario: string | null;
}
