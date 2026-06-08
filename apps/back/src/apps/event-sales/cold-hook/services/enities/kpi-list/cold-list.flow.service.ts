import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import { ETimeZone, toCrmDateTime } from '@/shared/lib/date';
import { ColdHookBatchGroupBuffer } from '../../batch/cold-hook-batch-group-buffer';
import { KpiListFlowService } from '../../../../shared/kpi-list-flow/services/kpi-list-flow.service';
import { KpiEventPayload } from '../../../../shared/kpi-list-flow/type/kpi-event-payload.type';

export interface IColdListFlowData {
    /** Заголовок события («от 26 мая 2026») */
    name: string;
    /** ISO/локальный deadline планируемого звонка */
    deadline: string;
    /** ID постановщика (автор) */
    createdId: string | number;
    /** ID ответственного */
    responsibleId: string | number;
    /** ID компании-владельца */
    companyId: string | number;
    /** ID базовой сделки (может быть `$result[...]` либо реальный ID) */
    baseDealId: string;
    /** ID xo-сделки (всегда `$result[...]`, создается в этом же батче) */
    xoDealId: string;
}

const EVENT_TITLE_PREFIX = 'Холодный звонок Запланирован';
const COMMENT_PREFIX = 'Холодный обзвон';

/**
 * Cold-specific обёртка над {@link KpiListFlowService}: фиксирует параметры
 * события «Холодный обзвон запланирован» (event_type=xo, event_action=plan,
 * op_work_status=in_work, ...) и делегирует создание элементов в KPI/History.
 *
 * Логика других event-типов (presentation, hot, fail, ...) живёт в своих
 * аналогах — этот сервис намеренно не пытается охватить весь legacy
 * `BitrixListFlowService::getBatchListFlow`.
 *
 * Не `@Injectable` — создаётся через `new` рядом с `BitrixService`
 * (см. CLAUDE.md, race condition с заинъекченным `this.bitrix`).
 */
export class ColdListFlowService {
    private readonly logger = new Logger(ColdListFlowService.name);
    private readonly kpiFlow: KpiListFlowService;

    constructor(
        bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {
        this.kpiFlow = new KpiListFlowService(bitrix, portal);
    }

    flow(data: IColdListFlowData, buffer: ColdHookBatchGroupBuffer): void {
        this.logger.log(`cold list flow company=${data.companyId}`);
        const payload = this.buildPayload(data);
        this.kpiFlow.flow(payload, data.companyId, buffer);
    }

    private buildPayload(data: IColdListFlowData): KpiEventPayload {
        const portalTz = this.portal.getTimezone();
        const eventTitle = `${EVENT_TITLE_PREFIX} ${data.name}`;

        return {
            name: eventTitle,
            values: {
                event_date: this.nowCrmDateTime(portalTz),
                event_title: eventTitle,
                plan_date: toCrmDateTime(data.deadline, portalTz),
                author: data.createdId,
                responsible: data.responsibleId,
                su: data.responsibleId,
                crm: this.buildCrmValue(data),
                crm_company: { n0: `CO_${data.companyId}` },
                manager_comment: `${COMMENT_PREFIX} ${data.name}`,
            },
            items: {
                event_type: 'xo',
                event_action: 'plan',
                op_work_status: 'op_status_in_work',
                op_result_status: 'op_call_result_yes',
                op_prospects_type: 'op_prospects_good',
            },
        };
    }

    private buildCrmValue(data: IColdListFlowData): Record<string, string> {
        return {
            n0: `CO_${data.companyId}`,
            n1: `D_${data.baseDealId}`,
            n2: `D_${data.xoDealId}`,
        };
    }

    /**
     * `toCrmDateTime` принимает только перечисленные входные форматы
     * (см. parsePortalInput). `Date.toISOString()` с `Z` через dayjs strict
     * не парсится, поэтому форматируем «сейчас» напрямую в TZ портала.
     */
    private nowCrmDateTime(portalTz: ETimeZone): string {
        return dayjs().tz(portalTz).format('DD.MM.YYYY HH:mm:ss');
    }
}
