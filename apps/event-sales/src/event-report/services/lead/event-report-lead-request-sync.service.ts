import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import {
    EnumLeadOpStatusCode,
    EnumLeadRequestFieldCode,
    EnumLeadSiteStageCode,
    EnumLeadSiteStatusCode,
} from '@lib/portal-lib/pbx/pbx-lead-request/type/pbx-lead-request.enum';
import {
    appendLeadRequestHistory,
    buildLeadRequestHistoryEntry,
} from '../../../shared/lead-request/lead-request-history.util';
import { EventReportContext } from '../context/event-report.context';

type BxRow = Record<string, unknown>;

/** Итог синка — для лога/диагностики. */
export interface LeadRequestSyncResult {
    /** Скольким лидам записали статусы/историю. */
    synced: number;
    warnings: string[];
}

/**
 * Синхронизация связанных заявок/лидов при ФИНАЛЬНОМ событии из «Звонков»
 * (продажа или отказ). Правило пользователя: к финалу все статусы заявки
 * обязаны быть отмечены; «не ЦА» испрашивается фронтом при отказе и
 * приходит в dto.leadSync.notCaTypeCode.
 *
 * Что пишется каждому связанному лиду (graceful — нет поля → скип):
 *  - продажа: op_lead_status=Продажа, стадия заявки=Продажа,
 *    op_lead_is_boost_sale=1 (заявка повлияла на продажу);
 *  - отказ: статус заявки=Отказ (или «Не ЦА» при notCaType),
 *    стадия=Отказ, op_lead_status=Отказ/«Не ца», op_lead_not_ca_type;
 *  - история обработки заявки — новая append-запись.
 *
 * Работает ПОСЛЕ основного батча отдельными волнами (чтение лидов →
 * запись): multiple-история требует текущих значений. Стоимость — 2 HTTP
 * и только на финалах.
 *
 * НЕ @Injectable: new с per-domain bitrix (правило CLAUDE.md).
 */
export class EventReportLeadRequestSyncService {
    private readonly logger = new Logger(
        EventReportLeadRequestSyncService.name,
    );

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    async run(ctx: EventReportContext): Promise<LeadRequestSyncResult> {
        const result: LeadRequestSyncResult = { synced: 0, warnings: [] };
        if (!ctx.isSuccessSale && !ctx.isFail) return result;

        const leadIds = this.collectLeadIds(ctx);
        if (leadIds.length === 0) return result;

        // Волна 1: текущее состояние лидов (история — multiple, нужен append).
        for (const leadId of leadIds) {
            this.bitrix.batch.lead.get(`lr_sync_get_${leadId}`, leadId);
        }
        const readChunks = await this.bitrix.api.callBatchWithConcurrency(1);
        const leads = new Map<number, BxRow>();
        for (const chunk of readChunks) {
            for (const [cmd, value] of Object.entries(
                (chunk?.result ?? {}) as Record<string, unknown>,
            )) {
                const match = /^lr_sync_get_(\d+)$/.exec(cmd);
                if (match && value && typeof value === 'object') {
                    leads.set(Number(match[1]), value as BxRow);
                }
            }
        }

        // Волна 2: запись статусов + истории.
        for (const [leadId, lead] of leads) {
            const fields = this.buildFields(ctx, lead);
            if (Object.keys(fields).length === 0) continue;
            this.bitrix.batch.lead.update(
                `lr_sync_upd_${leadId}`,
                leadId,
                fields as never,
            );
            result.synced += 1;
        }
        if (result.synced > 0) {
            await this.bitrix.api.callBatchWithConcurrency(1);
        }

        this.logger.log(
            `lead-request sync: ${ctx.isSuccessSale ? 'продажа' : 'отказ'} → лидов ${result.synced}/${leadIds.length}`,
        );
        return result;
    }

    /** Связанные лиды: сам лид контекста + лиды сделки-владельца. */
    private collectLeadIds(ctx: EventReportContext): number[] {
        const ids = new Set<number>();
        const push = (raw: unknown): void => {
            const values = Array.isArray(raw) ? raw : [raw];
            for (const value of values) {
                if (value == null) continue;
                const match = /^(?:L_)?(\d+)$/.exec(String(value).trim());
                if (match && Number(match[1]) > 0) ids.add(Number(match[1]));
            }
        };

        if (ctx.lead?.ID) push(ctx.lead.ID);
        const deal = ctx.ownerDeal as unknown as BxRow | null;
        if (deal) {
            push(deal.LEAD_ID);
            for (const code of [
                PBX_SALES_EVENT_FIELD_CODES.deal_from_lead_id,
                PBX_SALES_EVENT_FIELD_CODES.deal_joined_leads,
            ]) {
                const field = this.portal.getEntityFieldByCode('deal', code);
                if (!field) continue;
                push(deal[this.portal.getFieldBitrixId(field)]);
            }
        }
        return [...ids];
    }

    private buildFields(ctx: EventReportContext, lead: BxRow): BxRow {
        const fields: BxRow = {};
        const notCaType = ctx.dto.leadSync?.notCaTypeCode ?? null;

        if (ctx.isSuccessSale) {
            this.setItem(
                fields,
                EnumLeadRequestFieldCode.op_lead_status,
                EnumLeadOpStatusCode.sale,
            );
            this.setItem(
                fields,
                EnumLeadRequestFieldCode.op_lead_site_stage,
                EnumLeadSiteStageCode.sale,
            );
            this.setBool(
                fields,
                EnumLeadRequestFieldCode.op_lead_is_boost_sale,
                true,
            );
        } else {
            this.setItem(
                fields,
                EnumLeadRequestFieldCode.op_lead_site_status,
                notCaType
                    ? EnumLeadSiteStatusCode.notCa
                    : EnumLeadSiteStatusCode.fail,
            );
            this.setItem(
                fields,
                EnumLeadRequestFieldCode.op_lead_site_stage,
                EnumLeadSiteStageCode.fail,
            );
            this.setItem(
                fields,
                EnumLeadRequestFieldCode.op_lead_status,
                notCaType
                    ? EnumLeadOpStatusCode.notCa
                    : EnumLeadOpStatusCode.fail,
            );
            if (notCaType) {
                this.setItem(
                    fields,
                    EnumLeadRequestFieldCode.op_lead_not_ca_type,
                    notCaType,
                );
            }
        }

        this.appendHistory(ctx, lead, fields);
        return fields;
    }

    /** Запись в историю обработки заявки: финал + заметка менеджера. */
    private appendHistory(
        ctx: EventReportContext,
        lead: BxRow,
        fields: BxRow,
    ): void {
        const field = this.portal.getEntityFieldByCode(
            'lead',
            EnumLeadRequestFieldCode.op_lead_firstprepare_history,
        );
        if (!field) return;
        const bitrixId = this.portal.getFieldBitrixId(field);
        const tz = this.portal.getTimezone();

        const base = ctx.isSuccessSale ? 'Продажа' : 'Отказ';
        const notCa = ctx.dto.leadSync?.notCaTypeCode ? ' (не ЦА)' : '';
        let history = appendLeadRequestHistory(
            lead[bitrixId],
            buildLeadRequestHistoryEntry(`${base}${notCa} — из «Звонков»`, tz),
        );
        const note = ctx.dto.leadSync?.note?.trim();
        if (note) {
            history = appendLeadRequestHistory(
                history,
                buildLeadRequestHistoryEntry(note, tz),
            );
        }
        fields[bitrixId] = history;
    }

    /** item-код → bitrixId значения; нет поля/items — молчаливый скип. */
    private setItem(fields: BxRow, code: string, itemCode: string): void {
        const field = this.portal.getEntityFieldByCode('lead', code);
        if (!field) return;
        const item = field.items.find(it => it.code === itemCode);
        if (!item) return;
        fields[this.portal.getFieldBitrixId(field)] = item.bitrixId;
    }

    private setBool(fields: BxRow, code: string, value: boolean): void {
        const field = this.portal.getEntityFieldByCode('lead', code);
        if (!field) return;
        fields[this.portal.getFieldBitrixId(field)] = value ? 1 : 0;
    }
}
