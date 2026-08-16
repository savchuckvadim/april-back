import { Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { nowCrmDateTime, BitrixDateTime } from '@/shared/lib/date';
import { KpiListFlowService } from '../../../shared/kpi-list-flow/services/kpi-list-flow.service';
import { KpiEventPayload } from '../../../shared/kpi-list-flow/type/kpi-event-payload.type';
import { IBatchGroupBuffer } from '../../../shared/batch/batch-group-buffer.interface';
import { KpiEventItemCodes } from '../../../shared/kpi-list-flow/type/kpi-event-payload.type';
import {
    buildColdTaskTitle,
    LEAD_WORK_KIND,
    LeadWorkKind,
} from '../../../shared/event-title';

/** Код item'а `event_type` списка KPI (типизация portal-lib, без magic-строк). */
type KpiEventTypeCode = NonNullable<KpiEventItemCodes['event_type']>;

/** Заголовки — как у классического ХО-хука (`ColdListFlowService`). */
const PLANNED_TITLE_PREFIX = 'Холодный звонок Запланирован';
const NOT_HELD_TITLE_PREFIX = 'Холодный звонок Не состоялся';
const COMMENT_PREFIX = 'Холодный обзвон';

/**
 * Вид холодной работы → код item'а `event_type` списка KPI.
 *
 * Тот же маппинг, что у отчёта (`EVENT_TYPE_TO_KPI_ITEM` в
 * event-report-kpi-payload.builder): заявка и входящий лид пишутся своими
 * кодами и НЕ сливаются с холодным обзвоном. Раньше хук ставил `xo` всем
 * подряд, и в отчётности обработка заявок была неотличима от обзвона
 * «вхолодную».
 *
 * ⚠ ТОЧКА РАЗРЫВА РЯДА: раздельные коды введены 13.08.2026 по решению
 * владельца. ДО этой даты все холодные события писались как `xo` — заявки в
 * более ранних периодах не выделены, сравнивать разрез по видам с ними
 * нельзя. Прошлые записи не переписываются, коды меняются только у новых.
 *
 * Захотят снова считать все холодные одним кодом — правится ТОЛЬКО эта
 * таблица (и парная `EVENT_TYPE_TO_KPI_ITEM` в event-report).
 */
const WORK_KIND_TO_KPI_EVENT_TYPE: Record<LeadWorkKind, KpiEventTypeCode> = {
    [LEAD_WORK_KIND.cold]: 'xo',
    [LEAD_WORK_KIND.request]: 'site',
    [LEAD_WORK_KIND.lead]: 'come_call',
};

/**
 * План-запись пишется на +1 с от «не состоялся»: события уходят одним
 * батчем, но хронологически сначала закрывается старый обзвон, потом
 * планируется новый (паттерн PLAN_EVENT_DATE_OFFSET_SEC из event-report).
 */
const PLAN_EVENT_DATE_OFFSET_SEC = 1;

/** Ссылки события на CRM: собираются из того, что есть у лида. */
export interface ILeadToWorkKpiRefs {
    leadId: number;
    /** Реальный id ЛИБО `$result[cmd]` создаваемой компании; null — без компании. */
    companyRef: string | null;
    /** Реальный id ЛИБО `$result[cmd]` основной сделки. */
    baseDealRef: string;
    /** Реальный id ЛИБО `$result[cmd]` ХО-сделки; null — воронки ХО нет. */
    xoDealRef: string | null;
    /** Реальный id компании для кода элемента; null → код от лида. */
    companyId: number | null;
}

export interface ILeadToWorkKpiPlanned {
    refs: ILeadToWorkKpiRefs;
    /** Название события (обычно название лида/компании). */
    name: string;
    /** Вид работы: слово в заголовке + код события в KPI. */
    kind: LeadWorkKind;
    responsibleId: number;
    /** Автор (инициатор операции); нет — ответственный. */
    authorId: number | null;
    /** Дедлайн задачи; нет — план-дата не пишется. */
    deadline: BitrixDateTime | null;
}

export interface ILeadToWorkKpiNotHeld {
    refs: ILeadToWorkKpiRefs;
    name: string;
    /** Вид работы: слово в заголовке + код события в KPI. */
    kind: LeadWorkKind;
    /** Прежний ответственный — у него обзвон «не состоялся». */
    prevResponsibleId: number;
    authorId: number | null;
}

/**
 * KPI/History ХО-ветки хука «лид → работа».
 *
 * Правило (см. README §6): прошлое не переписываем, новое событие
 * фиксируем. Отличие от `ColdListFlowService` — работает и БЕЗ компании:
 * crm-ссылки собираются из имеющегося (`L_лид` + `D_base` + `D_xo`),
 * код элемента — от companyId ?? leadId.
 *
 * Элементы кладутся в ТУ ЖЕ batch-группу лида (до endGroup()), поэтому
 * `$result[…]`-ссылки на создаваемые сделки валидны.
 *
 * НЕ @Injectable: создаётся `new` рядом с per-domain BitrixService.
 */
export class LeadToWorkKpiService {
    private readonly logger = new Logger(LeadToWorkKpiService.name);
    private readonly kpiFlow: KpiListFlowService;

    constructor(
        bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {
        this.kpiFlow = new KpiListFlowService(bitrix, portal);
    }

    /** «Холодный звонок Запланирован …» — новому ответственному. */
    queuePlanned(data: ILeadToWorkKpiPlanned, buffer: IBatchGroupBuffer): void {
        const title = this.title(PLANNED_TITLE_PREFIX, data.name, data.kind);
        const tz = this.portal.getTimezone();
        const payload: KpiEventPayload = {
            name: title,
            values: {
                event_date: dayjs()
                    .add(PLAN_EVENT_DATE_OFFSET_SEC, 'second')
                    .tz(tz)
                    .format('DD.MM.YYYY HH:mm:ss'),
                event_title: title,
                plan_date: data.deadline?.toCrmDateTime() ?? null,
                author: data.authorId ?? data.responsibleId,
                responsible: data.responsibleId,
                su: data.responsibleId,
                crm: this.buildCrmValue(data.refs),
                crm_company: this.buildCrmCompany(data.refs),
                manager_comment: `${COMMENT_PREFIX} ${data.name}`,
            },
            items: {
                event_type: WORK_KIND_TO_KPI_EVENT_TYPE[data.kind],
                event_action: 'plan',
                op_work_status: 'op_status_in_work',
                op_result_status: 'op_call_result_yes',
                op_prospects_type: 'op_prospects_good',
            },
        };
        this.logger.log(
            `[kpi] lead=${data.refs.leadId} planned → ${data.responsibleId}` +
                ` plan_date="${data.deadline?.toCrmDateTime() ?? '—'}"`,
        );
        this.kpiFlow.flow(payload, this.entityId(data.refs), buffer);
    }

    /**
     * «Холодный звонок Не состоялся …» — прежнему ответственному при
     * передаче обзвона другому. Существующие элементы НЕ трогаются —
     * это новая запись-факт, прошлое остаётся как было.
     */
    queueNotHeld(data: ILeadToWorkKpiNotHeld, buffer: IBatchGroupBuffer): void {
        const title = this.title(NOT_HELD_TITLE_PREFIX, data.name, data.kind);
        const tz = this.portal.getTimezone();
        const payload: KpiEventPayload = {
            name: title,
            values: {
                event_date: nowCrmDateTime(tz),
                event_title: title,
                plan_date: null,
                author: data.authorId ?? data.prevResponsibleId,
                responsible: data.prevResponsibleId,
                su: data.prevResponsibleId,
                crm: this.buildCrmValue(data.refs),
                crm_company: this.buildCrmCompany(data.refs),
                manager_comment: `Передача холодного обзвона: ${data.name}`,
            },
            items: {
                event_type: WORK_KIND_TO_KPI_EVENT_TYPE[data.kind],
                event_action: 'expired',
                op_result_status: 'op_call_result_no',
                op_work_status: 'op_status_in_work',
            },
        };
        this.logger.log(
            `[kpi] lead=${data.refs.leadId} not-held → ${data.prevResponsibleId}`,
        );
        this.kpiFlow.flow(payload, this.entityId(data.refs), buffer);
    }

    /**
     * Заголовок события: вид работы получает своё слово между префиксом и
     * названием («Холодный звонок Запланирован. Заявка. ООО Ромашка»,
     * «… Не состоялся. Лид. ООО Ромашка»). Формат общий с задачами —
     * см. `buildColdTaskTitle`.
     */
    private title(prefix: string, name: string, kind: LeadWorkKind): string {
        return buildColdTaskTitle(prefix, kind, name);
    }

    /** crm-ссылки: лид всегда, компания/сделки — по наличию. */
    private buildCrmValue(refs: ILeadToWorkKpiRefs): Record<string, string> {
        const links: Record<string, string> = {};
        let index = 0;
        const push = (value: string) => {
            links[`n${index++}`] = value;
        };
        if (refs.companyRef) push(`CO_${refs.companyRef}`);
        push(`L_${refs.leadId}`);
        push(`D_${refs.baseDealRef}`);
        if (refs.xoDealRef) push(`D_${refs.xoDealRef}`);
        return links;
    }

    private buildCrmCompany(
        refs: ILeadToWorkKpiRefs,
    ): Record<string, string> | undefined {
        return refs.companyRef ? { n0: `CO_${refs.companyRef}` } : undefined;
    }

    /**
     * Идентификатор для кода элемента списка (исторический формат
     * `{list.type}_{entityId}_{suffix}`) — компания, а без неё лид.
     */
    private entityId(refs: ILeadToWorkKpiRefs): number {
        return refs.companyId ?? refs.leadId;
    }
}
