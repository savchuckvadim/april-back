import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { buildCrmRefValue } from '../../../../shared/portal-fields';
import { IBatchGroupBuffer } from '../../../../shared/batch/batch-group-buffer.interface';
import { ResolvedLeadToWorkItem } from '../../dto/lead-to-work.dto';
import { LeadToWorkContext } from '../lead-to-work-context.service';
import { LeadToWorkStagePlan } from '../lead-to-work-stage.resolver';
import { LeadRequestDetection } from '../lead-request-detector.service';
import { IXoEventContext } from '../models/xo-event-entity.model';
import { LeadXoEventEntityModel } from '../models/lead-xo-event-entity.model';
import {
    BxRow,
    LeadToWorkFlowBase,
    XO_TASK_PREFIX,
} from './lead-to-work-flow.base';

/** Итог записи в лид. */
export interface LeadFlowResult {
    /** Записи не было (ни одного поля к записи). */
    skipped: boolean;
    warnings: string[];
}

/** Что нужно лид-ветке от уже поставленных команд. */
export interface LeadFlowInput {
    dealRef: string;
    xoRef: string | null;
    detection: LeadRequestDetection;
    eventCtx: IXoEventContext | null;
    /** Компания есть или создаётся этой же группой. */
    hasCompany: boolean;
    /** Имена сотрудников (id → «Имя Фамилия») для читаемой истории. */
    userNames?: Record<number, string>;
}

/**
 * Лид в хуке «лид → работа»: стадия, ответственный и ВЕСЬ пакет полей
 * заявки — их считает `LeadXoEventEntityModel` (событийные поля ХО + связи
 * + метки + история). Здесь только сборка контекста модели и постановка
 * команды: у лида набор полей шире, чем у компании и сделки, поэтому вся
 * доменная логика значений живёт в модели.
 */
export class LeadFlowService extends LeadToWorkFlowBase {
    queue(
        item: ResolvedLeadToWorkItem,
        ctx: LeadToWorkContext,
        plan: LeadToWorkStagePlan,
        input: LeadFlowInput,
        buffer: IBatchGroupBuffer,
    ): LeadFlowResult {
        const warnings: string[] = [];
        const fields: BxRow = {};
        if (plan.leadStatusId) fields.STATUS_ID = plan.leadStatusId;
        // ХО-ветка передаёт работу целиком — лид тоже новому ответственному.
        if (item.isXo === 'Y') {
            fields.ASSIGNED_BY_ID = String(item.responsible);
        }

        const leadRow = ctx.lead as unknown as BxRow;
        // Формат ссылок зависит от привязок КОНКРЕТНОГО поля портала.
        const toBaseName = this.leadFieldName(
            PBX_SALES_EVENT_FIELD_CODES.to_base_sales,
        );
        const toXoName = this.leadFieldName(
            PBX_SALES_EVENT_FIELD_CODES.to_xo_sales,
        );
        const model = new LeadXoEventEntityModel(this.portal, leadRow, {
            eventCtx: input.eventCtx,
            isRequest: input.detection.isRequest,
            workKind: input.detection.kind,
            baseDealRef: toBaseName
                ? this.leadDealRef(toBaseName, input.dealRef)
                : null,
            xoDealRef:
                toXoName && input.xoRef
                    ? this.leadDealRef(toXoName, input.xoRef)
                    : null,
            hasCompany: input.hasCompany,
            userNames: input.userNames,
            previousResponsibleId: this.prevResponsible(ctx),
            transferredById: item.transferredBy ?? null,
            timezone: this.portal.getTimezone(),
            responsibleId: item.responsible,
            /*
             * Событийные поля ХО (xo_date, история обзвона, op_work_status…)
             * пишутся ТОЛЬКО в ХО-ветке: конвертация лида в работу холодным
             * обзвоном не является.
             */
            withXoEventFields: item.isXo === 'Y',
        });
        Object.assign(fields, model.getFields());

        this.warnIfFieldsInvisible(item.leadId, fields, warnings);

        if (Object.keys(fields).length === 0) {
            return { skipped: true, warnings };
        }
        const cmd = `lw_lead_${item.leadId}`;
        buffer.queue(() =>
            this.bitrix.batch.lead.update(cmd, item.leadId, fields as never),
        );
        return { skipped: false, warnings };
    }

    /**
     * Прежний ответственный за обзвон: открытая задача «Холодный обзвон…»
     * → ответственный существующей ХО-сделки → null (первый ХО по лиду).
     * Нужен и лид-ветке (история передачи), и KPI-ветке («не состоялся»).
     */
    prevResponsible(ctx: LeadToWorkContext): number | null {
        for (const task of ctx.openTasks) {
            const row = task as unknown as BxRow;
            const title = this.text(row.title) ?? this.text(row.TITLE) ?? '';
            if (!title.startsWith(XO_TASK_PREFIX)) continue;
            const id = Number(row.responsibleId ?? row.RESPONSIBLE_ID);
            if (Number.isFinite(id) && id > 0) return id;
        }
        const xo = ctx.existingXoDeal as unknown as BxRow | null;
        if (xo) {
            const id = Number(xo.ASSIGNED_BY_ID);
            if (Number.isFinite(id) && id > 0) return id;
        }
        return null;
    }

    /* ------------------------------------------------------------------ */

    /**
     * Явный сигнал «портал не отдаёт поля лида»: в fields только системные
     * ключи (STATUS_ID/ASSIGNED_BY_ID) — значит ни одно UF-поле лида не
     * разрезолвилось. Практически всегда это неполный слепок портала
     * (внешний getportal не отдал секцию lead) или неустановленные поля.
     */
    private warnIfFieldsInvisible(
        leadId: number,
        fields: BxRow,
        warnings: string[],
    ): void {
        const ufKeys = Object.keys(fields).filter(key => key.startsWith('UF_'));
        if (ufKeys.length > 0) return;
        const message =
            `Портал не отдаёт ни одного UF-поля ЛИДА ${leadId} — заполнены ` +
            'только системные поля. Проверьте установку полей лида и сбросьте ' +
            'кэш слепка портала (POST /pbx-portal-cache/invalidate?domain=…)';
        warnings.push(message);
        this.logger.warn(`[lead-fields] ${message}`);
    }

    /**
     * Значение ссылки на сделку для crm-поля ЛИДА (`to_base_sales`,
     * `to_xo_sales`) в формате, который принимает КОНКРЕТНОЕ поле портала:
     * один разрешённый тип → голый id, несколько → `D_{id}`.
     *
     * Формат берётся из фактических SETTINGS поля (см. buildCrmRefValue):
     * ошибиться нельзя — Битрикс не ругается, а молча не сохраняет значение,
     * и связь остаётся пустой.
     */
    private leadDealRef(ufName: string, ref: string): string {
        return buildCrmRefValue(
            this.ufDefinitions[ufName]?.crmTypes ?? [],
            'DEAL',
            ref,
        );
    }
}
