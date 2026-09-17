import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { Logger } from '@nestjs/common';
import { nowCrmDateTime, BitrixDateTime } from '@/shared/lib/date';
import { SalesBatchGroupBuffer as ColdHookBatchGroupBuffer } from '../../../../shared/batch';
import { KpiListFlowService } from '../../../../shared/kpi-list-flow/services/kpi-list-flow.service';
import {
    KpiEventPayload,
    KpiEventScalarValues,
} from '../../../../shared/kpi-list-flow/type/kpi-event-payload.type';
import { ColdOwner, ownerKey } from '../cold-owner.type';

export interface IColdListFlowData {
    /** Заголовок события («от 26 мая 2026») */
    name: string;
    /** Дедлайн планируемого звонка (TZ-конвертация инкапсулирована). */
    deadline: BitrixDateTime;
    /** ID постановщика (автор) */
    createdId: string | number;
    /** ID ответственного */
    responsibleId: string | number;
    /** Владелец работы: компания либо клиент без компании (сделка). */
    owner: ColdOwner;
    /**
     * ID базовой сделки (может быть `$result[...]` либо реальный ID);
     * null — основной нет (стадия «Холодные» не сопоставлена).
     */
    baseDealId: string | null;
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
 * Клиент без компании (v2, шаг 6): crm-привязка строки — сделки, лид и
 * контакт входной сделки; `crm_company` не пишется.
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
        const key = ownerKey(data.owner);
        this.logger.log(`cold list flow owner=${key}`);
        const payload = this.buildPayload(data);
        this.kpiFlow.flow(payload, key, buffer);
    }

    private buildPayload(data: IColdListFlowData): KpiEventPayload {
        const portalTz = this.portal.getTimezone();
        const eventTitle = `${EVENT_TITLE_PREFIX} ${data.name}`;
        this.logger.log(
            `[deadline][list] owner=${ownerKey(data.owner)} ` +
                `plan_date="${data.deadline.toCrmDateTime()}" (локаль портала) ` +
                `event_date="${nowCrmDateTime(portalTz)}"`,
        );

        return {
            name: eventTitle,
            values: {
                event_date: nowCrmDateTime(portalTz),
                event_title: eventTitle,
                plan_date: data.deadline.toCrmDateTime(),
                author: data.createdId,
                responsible: data.responsibleId,
                su: data.responsibleId,
                crm: this.buildCrmValue(data),
                ...this.buildClientLinks(data.owner),
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

    /** `crm` строки: компания (если есть), основная, ХО-сделка, лид без компании. */
    private buildCrmValue(data: IColdListFlowData): Record<string, string> {
        const refs: string[] = [];
        if (data.owner.kind === 'company') {
            refs.push(`CO_${data.owner.companyId}`);
        }
        if (data.baseDealId) refs.push(`D_${data.baseDealId}`);
        refs.push(`D_${data.xoDealId}`);
        if (data.owner.kind === 'deal' && data.owner.leadId) {
            refs.push(`L_${data.owner.leadId}`);
        }
        return Object.fromEntries(refs.map((ref, index) => [`n${index}`, ref]));
    }

    /** Отдельные поля-привязки клиента: компания либо контакт. */
    private buildClientLinks(
        owner: ColdOwner,
    ): Pick<KpiEventScalarValues, 'crm_company' | 'crm_contact'> {
        if (owner.kind === 'company') {
            return { crm_company: { n0: `CO_${owner.companyId}` } };
        }
        return owner.contactId
            ? { crm_contact: { n0: `C_${owner.contactId}` } }
            : {};
    }
}
