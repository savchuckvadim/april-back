import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { toBatchText } from '@lib/bitrix/consts/batch.consts';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import {
    EnumLeadRequestFieldCode,
    EnumLeadSiteStatusCode,
    LEAD_SITE_STATUS_RANK,
} from '@lib/portal-lib/pbx/pbx-lead-request/type/pbx-lead-request.enum';
import {
    appendLeadRequestHistory,
    buildLeadRequestHistoryEntry,
} from '../../../shared/lead-request/lead-request-history.util';
import {
    buildCrmRefValue,
    LeadUfDefinitions,
    parseCrmRefId,
} from '../../../shared/portal-fields';
import { EventReportContext } from '../context/event-report.context';
import { PRESENTATION_SURVEY_FIELD_CODES } from '../entity/event-report-entity-fields.model';

type BxRow = Record<string, unknown>;

/** Итог синка — для лога/диагностики. */
export interface LeadRequestSyncResult {
    /** Скольким лидам записали статусы/историю. */
    synced: number;
    warnings: string[];
}

/**
 * Синхронизация связанных заявок/лидов из отчёта «Звонков». Триггеры:
 *  - ФИНАЛ (продажа/отказ) — статусы всем связанным лидам;
 *  - СВЯЗЬ ПРЕЗЕНТАЦИИ (leadSync.presentationLink + leadId из модалки) —
 *    статусы, выбранные менеджером, только ВЫБРАННОМУ лиду + линк
 *    to_presentation_sales + история «Презентация связана с заявкой»;
 *  - АВТОСТАТУС ЗАЯВКИ (единая ось, 2408): любой отчёт двигает
 *    op_lead_site_status «только вперёд» по лестнице
 *    Первый звонок → Дозвонились → Презентация (LEAD_SITE_STATUS_RANK) —
 *    без записи истории и без спама: лид уже прочитан волной 1, статус
 *    пишется лишь когда реально повышается.
 *
 * Что пишется на финале (graceful — нет поля → скип):
 *  - продажа: op_lead_status=Продажа, стадия заявки=Продажа,
 *    op_lead_is_boost_sale=1 (заявка повлияла на продажу);
 *  - отказ: статус заявки=Отказ (или «Не ЦА» при notCaType),
 *    стадия=Отказ, op_lead_status=Отказ/«Не ца», op_lead_not_ca_type;
 *  - история обработки заявки — новая append-запись.
 * Явные siteStatusCode/siteStageCode из dto применяются ПОВЕРХ дефолтов
 * (выбор менеджера главнее вычисленного).
 *
 * Работает ПОСЛЕ основного батча отдельными волнами (чтение лидов →
 * запись): multiple-история требует текущих значений. Стоимость — 2 HTTP
 * и только на финалах/связи презентации.
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
        /**
         * Фактические определения UF-полей лида (SETTINGS): от количества
         * разрешённых типов зависит формат crm-значения. Пусто — работаем
         * на безопасном дефолте с префиксом.
         */
        private readonly ufDefinitions: LeadUfDefinitions = {},
    ) {}

    async run(ctx: EventReportContext): Promise<LeadRequestSyncResult> {
        const result: LeadRequestSyncResult = { synced: 0, warnings: [] };
        const isFinal = ctx.isSuccessSale || ctx.isFail;
        const presentationLeadId = this.presentationLeadId(ctx);
        const axisTarget = this.axisStatusFor(ctx);
        if (!isFinal && !presentationLeadId && !axisTarget) return result;

        // Финал и автостатус двигают ВСЕ связанные лиды; связь презентации
        // добавляет выбранного менеджером (его лид может не быть в графе).
        const ids = new Set<number>();
        if (isFinal || axisTarget) {
            for (const id of this.collectLeadIds(ctx)) ids.add(id);
        }
        if (presentationLeadId) ids.add(presentationLeadId);
        const leadIds = [...ids];
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
            // Анкета проведённой презентации — ТОЛЬКО лиду, с которым её
            // связал менеджер (явный выбор сильнее любой эвристики).
            if (ctx.isPresentationDone && leadId === presentationLeadId) {
                this.appendPresentationSurvey(ctx, leadId, fields);
            }
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

        const reason = ctx.isSuccessSale
            ? 'продажа'
            : ctx.isFail
              ? 'отказ'
              : presentationLeadId
                ? 'связь презентации'
                : 'автостатус заявки';
        this.logger.log(
            `lead-request sync: ${reason} → лидов ${result.synced}/${leadIds.length}`,
        );
        return result;
    }

    /**
     * Анкета проведённой презентации («Хвост», «Пять К», детальные «5К») —
     * связанному лиду.
     *
     * Источник — ЛИД КОНТЕКСТА (`ctx.lead`): именно в него фрейм пишет
     * ответы из анкеты, и он же — «один открытый лид, прокинутый через
     * задачу» из правила владельца. Если менеджер связал презентацию с
     * ДРУГОЙ заявкой (модалка presentationLink), ответы переносятся на
     * неё, чтобы карточка заявки показывала итог презентации.
     *
     * Себе самому не пишем: когда связанный лид и есть лид контекста,
     * ответы на нём уже стоят, а перезапись снапшотом init-фазы могла бы
     * их откатить. Пустые значения не переносятся, неустановленное поле
     * молча пропускается (graceful, как во всём event-report).
     */
    private appendPresentationSurvey(
        ctx: EventReportContext,
        targetLeadId: number,
        fields: BxRow,
    ): void {
        const source = ctx.lead as unknown as BxRow | null;
        if (!source) return;
        if (Number(source.ID) === targetLeadId) return;

        for (const code of PRESENTATION_SURVEY_FIELD_CODES) {
            const field = this.portal.getEntityFieldByCode('lead', code);
            if (!field) continue;
            const key = this.portal.getFieldBitrixId(field);
            const raw = source[key];
            const value = typeof raw === 'string' ? raw.trim() : '';
            if (!value) continue;
            // Запись уходит batch-командой (lead.update волны 2): сырой
            // `\n` многострочных ответов доехал бы подчёркиванием.
            fields[key] = toBatchText(value);
        }
    }

    /** Лид, выбранный менеджером в модалке связи презентации (или null). */
    private presentationLeadId(ctx: EventReportContext): number | null {
        const sync = ctx.dto.leadSync;
        if (!sync?.presentationLink) return null;
        const leadId = Number(sync.leadId);
        return Number.isFinite(leadId) && leadId > 0 ? leadId : null;
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
        const sync = ctx.dto.leadSync;
        const notCaType = sync?.notCaTypeCode ?? null;

        /*
         * Ось слита (аудит 2408): исход несёт ОДИН op_lead_site_status;
         * op_lead_site_stage и op_lead_status выведены из оборота
         * (0 читателей-логики), их писатели сняты.
         */
        if (ctx.isSuccessSale) {
            this.setItem(
                fields,
                EnumLeadRequestFieldCode.op_lead_site_status,
                EnumLeadSiteStatusCode.sale,
            );
            this.setBool(
                fields,
                EnumLeadRequestFieldCode.op_lead_is_boost_sale,
                true,
            );
            this.linkSaleDeal(ctx, lead, fields);
        } else if (ctx.isFail) {
            this.setItem(
                fields,
                EnumLeadRequestFieldCode.op_lead_site_status,
                notCaType
                    ? EnumLeadSiteStatusCode.notCa
                    : EnumLeadSiteStatusCode.fail,
            );
            if (notCaType) {
                this.setItem(
                    fields,
                    EnumLeadRequestFieldCode.op_lead_not_ca_type,
                    notCaType,
                );
            }
        } else {
            // Не финал: автостатус единой оси — только вперёд по лестнице.
            this.applyAxisStatus(ctx, lead, fields);
        }

        // Явный выбор менеджера (модалка связи презентации) — поверх
        // вычисленных дефолтов: его решение главнее. siteStageCode из
        // старых сборок фрейма принимается, но игнорируется (ось слита).
        if (sync?.siteStatusCode) {
            this.setItem(
                fields,
                EnumLeadRequestFieldCode.op_lead_site_status,
                sync.siteStatusCode,
            );
        }

        if (this.presentationLeadId(ctx) === Number(lead.ID)) {
            this.linkPresentationDeal(ctx, lead, fields);
        }

        // История — только для финалов и связи презентации: автостатус на
        // каждом отчёте превратил бы append-историю заявки в спам.
        if (
            ctx.isSuccessSale ||
            ctx.isFail ||
            this.presentationLeadId(ctx) === Number(lead.ID)
        ) {
            this.appendHistory(ctx, lead, fields);
        }
        return fields;
    }

    /**
     * Целевой автостатус единой оси заявки по отчёту; null — двигать нечего
     * («новое дело», отмена — не разговор с клиентом).
     */
    private axisStatusFor(
        ctx: EventReportContext,
    ): EnumLeadSiteStatusCode | null {
        if (ctx.isSuccessSale || ctx.isFail) return null; // финалы — своя ветка
        if (ctx.isPresentationDone) {
            return EnumLeadSiteStatusCode.presentation;
        }
        if (ctx.isResult) return EnumLeadSiteStatusCode.reached;
        if (ctx.isNoResult) return EnumLeadSiteStatusCode.firstCall;
        return null;
    }

    /**
     * Автостатус «только вперёд»: пишется лишь когда лестница реально
     * повышается (LEAD_SITE_STATUS_RANK). Повторный недозвон после
     * «Дозвонились» ничего не трогает; финалы автоматика не перетирает.
     */
    private applyAxisStatus(
        ctx: EventReportContext,
        lead: BxRow,
        fields: BxRow,
    ): void {
        const target = this.axisStatusFor(ctx);
        if (!target) return;

        const field = this.portal.getEntityFieldByCode(
            'lead',
            EnumLeadRequestFieldCode.op_lead_site_status,
        );
        if (!field) return;

        const raw = lead[this.portal.getFieldBitrixId(field)];
        // Значение enum приходит числом или строкой id; иное — не значение.
        const rawId =
            typeof raw === 'number' || typeof raw === 'string'
                ? String(raw)
                : '';
        const currentCode = rawId
            ? (field.items.find(item => String(item.bitrixId) === rawId)
                  ?.code ?? null)
            : null;
        const currentRank =
            currentCode &&
            LEAD_SITE_STATUS_RANK[currentCode as EnumLeadSiteStatusCode];
        if (currentRank && currentRank >= LEAD_SITE_STATUS_RANK[target]) {
            return;
        }

        this.setItem(
            fields,
            EnumLeadRequestFieldCode.op_lead_site_status,
            target,
        );
    }

    /**
     * `to_sale_deal` заявки = сделка, по которой прошла продажа.
     *
     * Пишем ТОЛЬКО в пустое поле: если менеджер уже пометил другую сделку
     * (или это повторный отчёт по той же), перезапись стёрла бы фактическую
     * атрибуцию продажи — а это единственное место, где видно, какая заявка
     * привела к деньгам. Поле одиночное, «дописать вторую» нельзя.
     *
     * Формат значения берётся из ФАКТИЧЕСКИХ привязок поля на портале
     * (один разрешённый тип → голый id, несколько → `D_123`): у этого поля
     * привязка обычно одна (сделка), и `D_` такое поле молча отбрасывает.
     */
    private linkSaleDeal(
        ctx: EventReportContext,
        lead: BxRow,
        fields: BxRow,
    ): void {
        const dealId = Number(
            ctx.currentBaseDeal?.ID ?? ctx.ownerDeal?.ID ?? 0,
        );
        if (!Number.isFinite(dealId) || dealId <= 0) return;

        const field = this.portal.getEntityFieldByCode(
            'lead',
            PBX_SALES_EVENT_FIELD_CODES.to_sale_deal,
        );
        if (!field) return;
        const bitrixId = this.portal.getFieldBitrixId(field);
        if (parseCrmRefId(lead[bitrixId])) return; // уже помечена — не трогаем

        fields[bitrixId] = buildCrmRefValue(
            this.ufDefinitions[bitrixId]?.crmTypes ?? [],
            'DEAL',
            dealId,
        );
    }

    /**
     * to_presentation_sales лида ∪= D_{сделка презентации}. Линкуем только
     * УЖЕ СУЩЕСТВУЮЩУЮ сделку (отчёт по запланированной): id созданной этим
     * же батчем сделки здесь ещё неизвестен — свяжет следующий отчёт.
     */
    private linkPresentationDeal(
        ctx: EventReportContext,
        lead: BxRow,
        fields: BxRow,
    ): void {
        const presDealId = Number(ctx.currentPresDeal?.ID);
        if (!Number.isFinite(presDealId) || presDealId <= 0) {
            this.logger.debug(
                'связь презентации: сделка презентации создаётся этим же отчётом — to_presentation_sales допишется при следующем',
            );
            return;
        }
        const field = this.portal.getEntityFieldByCode(
            'lead',
            PBX_SALES_EVENT_FIELD_CODES.to_presentation_sales,
        );
        if (!field) return;
        const bitrixId = this.portal.getFieldBitrixId(field);
        const raw = lead[bitrixId];
        const current = (Array.isArray(raw) ? raw : [raw])
            .map(value => (value == null ? '' : String(value).trim()))
            .filter(Boolean);
        const link = `D_${presDealId}`;
        if (!current.includes(link)) {
            fields[bitrixId] = [...current, link];
        }
    }

    /** Запись в историю обработки заявки: событие + заметка менеджера. */
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

        const base = ctx.isSuccessSale
            ? 'Продажа'
            : ctx.isFail
              ? 'Отказ'
              : 'Презентация связана с заявкой';
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
