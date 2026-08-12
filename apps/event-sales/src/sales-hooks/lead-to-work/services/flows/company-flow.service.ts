import { IBatchGroupBuffer } from '../../../../shared/batch/batch-group-buffer.interface';
import { ResolvedLeadToWorkItem } from '../../dto/lead-to-work.dto';
import { LeadToWorkContext } from '../lead-to-work-context.service';
import { IXoEventContext } from '../models/xo-event-entity.model';
import { BxRow, LeadToWorkFlowBase } from './lead-to-work-flow.base';

/** Что вернула компания-ветка. */
export interface CompanyFlowResult {
    /** Ссылка на компанию: id либо `$result[cmd]`; null — компании нет. */
    ref: string | null;
    /** Ключ команды создания — по нему use-case достанет реальный id. */
    createdCmd?: string;
}

/**
 * Компания в хуке «лид → работа».
 *
 * Правила: компания лида берётся за основу, новая создаётся ТОЛЬКО по флагу
 * `createCompany=Y` (фейковых компаний не плодим — анти-паттерн старого
 * lead-hook). В ХО-ветке компания «передаётся» новому ответственному и
 * получает событийные поля обзвона, как в классическом ХО.
 */
export class CompanyFlowService extends LeadToWorkFlowBase {
    queue(
        item: ResolvedLeadToWorkItem,
        ctx: LeadToWorkContext,
        eventCtx: IXoEventContext | null,
        buffer: IBatchGroupBuffer,
    ): CompanyFlowResult {
        if (ctx.company) {
            const companyId = String(ctx.company.ID);
            if (item.isXo === 'Y') {
                const cmd = `lw_company_upd_${item.leadId}`;
                const fields: BxRow = {
                    ASSIGNED_BY_ID: String(item.responsible),
                    ...this.eventFields(
                        eventCtx,
                        'company',
                        ctx.company as unknown as BxRow,
                    ),
                };
                buffer.queue(() =>
                    this.bitrix.batch.company.update(
                        cmd,
                        Number(companyId),
                        fields as never,
                    ),
                );
            }
            return { ref: companyId };
        }

        if (item.createCompany !== 'Y') return { ref: null };

        const cmd = `lw_company_${item.leadId}`;
        const lead = ctx.lead as unknown as BxRow;
        const title =
            this.text(lead.COMPANY_TITLE) ?? this.text(lead.TITLE) ?? '';
        buffer.queue(() =>
            this.bitrix.batch.company.set(cmd, {
                TITLE: title,
                ASSIGNED_BY_ID: String(item.responsible),
                LEAD_ID: String(item.leadId),
                ...this.eventFields(eventCtx, 'company', null),
            } as never),
        );
        return { ref: `$result[${cmd}]`, createdCmd: cmd };
    }
}
