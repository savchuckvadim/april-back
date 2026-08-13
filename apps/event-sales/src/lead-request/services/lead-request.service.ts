import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    EnumLeadNotCaTypeCode,
    EnumLeadOpStatusCode,
    EnumLeadRelatedBaseStageCode,
    EnumLeadRequestFieldCode,
    EnumLeadSiteStageCode,
    EnumLeadSiteStatusCode,
} from '@lib/portal-lib/pbx/pbx-lead-request/type/pbx-lead-request.enum';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { LeadRequestDetectorService } from '../../sales-hooks/lead-to-work/services/lead-request-detector.service';
import {
    appendLeadRequestHistory,
    buildLeadRequestHistoryEntry,
    getLeadRequestAcceptState,
} from '../../shared/lead-request/lead-request-history.util';
import { LeadRequestCardDto } from '../dto/lead-request-card.dto';
import {
    LeadRequestUpdateDto,
    LeadRequestUpdateResultDto,
} from '../dto/lead-request-update.dto';
import {
    LeadUfDefinitions,
    LeadUfDefinitionsService,
} from '../../shared/portal-fields';

type BxRow = Record<string, unknown>;

/** Ссылка «Оценка» лидогена. */
const QUEST_URL_FIELD = 'UF_CRM_LEAD_QUEST_URL';
/** Код партнёра лидогена. */
const REG_NUMBER_FIELD = 'UF_CRM_REG_NUMBER';

/**
 * Карточка заявки/лида для приложения «Звонки»: чтение всех op_lead_*
 * полей одним lead.get и типизированное обновление с валидацией «не ЦА»
 * и append-историей. Инстанс bitrix/portal берётся через PBXService.init
 * на каждый вызов (в this не хранится — race condition, CLAUDE.md).
 */
/** Enum-поля карточки, для которых подтягиваются live-названия портала. */
const CARD_ENUM_FIELD_CODES: EnumLeadRequestFieldCode[] = [
    EnumLeadRequestFieldCode.op_lead_status,
    EnumLeadRequestFieldCode.op_lead_site_status,
    EnumLeadRequestFieldCode.op_lead_site_stage,
    EnumLeadRequestFieldCode.op_lead_not_ca_type,
    EnumLeadRequestFieldCode.op_leads_related_base_stage,
];

@Injectable()
export class LeadRequestService {
    private readonly logger = new Logger(LeadRequestService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly ufDefinitions: LeadUfDefinitionsService,
    ) {}

    async card(domain: string, leadId: number): Promise<LeadRequestCardDto> {
        const { bitrix, PortalModel: portal } = await this.pbx.init(domain);
        const lead = (await bitrix.lead.get(leadId))?.result as
            | BxRow
            | undefined;
        if (!lead) {
            throw new NotFoundException(`Лид ${leadId} не найден на портале`);
        }

        // Живые названия вариантов «как на портале» (кэш 10 мин; ошибка →
        // названия из DB). Ключи — UF-имена установленных enum-полей.
        const liveFieldNames = CARD_ENUM_FIELD_CODES.map(code => {
            const field = portal.getEntityFieldByCode('lead', code);
            return field ? portal.getFieldBitrixId(field) : null;
        }).filter((name): name is string => !!name);
        const live = await this.ufDefinitions.resolve(
            domain,
            bitrix,
            liveFieldNames,
        );

        const warnings: string[] = [];
        const detection = new LeadRequestDetectorService(portal).detect(lead);

        const card: LeadRequestCardDto = {
            leadId,
            title: this.text(lead.TITLE) ?? `Лид ${leadId}`,
            isRequest: detection.isRequest,
            requestSignals: detection.signals,
            questUrl: this.text(lead[QUEST_URL_FIELD]),
            regNumber: this.text(lead[REG_NUMBER_FIELD]),
            siteStatus: this.enumState<EnumLeadSiteStatusCode>(
                portal,
                lead,
                EnumLeadRequestFieldCode.op_lead_site_status,
                warnings,
                live,
            ),
            siteStage: this.enumState<EnumLeadSiteStageCode>(
                portal,
                lead,
                EnumLeadRequestFieldCode.op_lead_site_stage,
                warnings,
                live,
            ),
            leadStatus: this.enumState<EnumLeadOpStatusCode>(
                portal,
                lead,
                EnumLeadRequestFieldCode.op_lead_status,
                warnings,
                live,
            ),
            notCaType: this.enumState<EnumLeadNotCaTypeCode>(
                portal,
                lead,
                EnumLeadRequestFieldCode.op_lead_not_ca_type,
                warnings,
                live,
            ),
            relatedBaseStage: this.enumState<EnumLeadRelatedBaseStageCode>(
                portal,
                lead,
                EnumLeadRequestFieldCode.op_leads_related_base_stage,
                warnings,
                live,
            ),
            blackShort: this.bool(
                portal,
                lead,
                EnumLeadRequestFieldCode.op_lead_is_black_short,
            ),
            blackShortReason: this.fieldText(
                portal,
                lead,
                EnumLeadRequestFieldCode.op_lead_black_short_reason,
            ),
            isCompany: this.bool(
                portal,
                lead,
                EnumLeadRequestFieldCode.op_lead_is_company,
            ),
            nppReported: this.bool(
                portal,
                lead,
                EnumLeadRequestFieldCode.op_lead_is_npp_repoted,
            ),
            duplicateChecked: this.bool(
                portal,
                lead,
                EnumLeadRequestFieldCode.op_lead_is_duplicate_check,
            ),
            duplicateFound: this.bool(
                portal,
                lead,
                EnumLeadRequestFieldCode.op_lead_is_duplicate,
            ),
            mergedByExist: this.bool(
                portal,
                lead,
                EnumLeadRequestFieldCode.op_lead_is_merged_by_exist,
            ),
            boostSale: this.bool(
                portal,
                lead,
                EnumLeadRequestFieldCode.op_lead_is_boost_sale,
            ),
            history: this.history(portal, lead),
            baseDealId: this.dealRef(
                portal,
                lead,
                PBX_SALES_EVENT_FIELD_CODES.to_base_sales,
            ),
            xoDealId: this.dealRef(
                portal,
                lead,
                PBX_SALES_EVENT_FIELD_CODES.to_xo_sales,
            ),
            isAccepted: true,
            assignedById: this.numeric(lead.ASSIGNED_BY_ID),
            saleReadiness: { ready: false, missing: [] },
            warnings,
        };
        card.isAccepted = this.isAccepted(portal, lead, card);
        card.saleReadiness = this.saleReadiness(card);
        return card;
    }

    async update(
        dto: LeadRequestUpdateDto,
    ): Promise<LeadRequestUpdateResultDto> {
        const { bitrix, PortalModel: portal } = await this.pbx.init(dto.domain);
        const lead = (await bitrix.lead.get(dto.leadId))?.result as
            | BxRow
            | undefined;
        if (!lead) {
            throw new NotFoundException(
                `Лид ${dto.leadId} не найден на портале`,
            );
        }

        // Правило «не ЦА»: статус выбран, а типа нет ни в запросе, ни на лиде.
        const picksNotCa =
            dto.siteStatusCode === EnumLeadSiteStatusCode.notCa ||
            dto.leadStatusCode === EnumLeadOpStatusCode.notCa;
        const hasNotCaType =
            Boolean(dto.notCaTypeCode) ||
            Boolean(
                this.fieldRaw(
                    portal,
                    lead,
                    EnumLeadRequestFieldCode.op_lead_not_ca_type,
                ),
            );
        if (picksNotCa && !hasNotCaType) {
            throw new BadRequestException(
                'Для статуса «Не ЦА» обязателен тип не ЦА (notCaTypeCode)',
            );
        }

        const applied: string[] = [];
        const warnings: string[] = [];
        const fields: BxRow = {};

        const setItem = (
            code: EnumLeadRequestFieldCode,
            itemCode: string | undefined,
            label: string,
        ) => {
            if (!itemCode) return;
            const field = portal.getEntityFieldByCode('lead', code);
            if (!field) {
                warnings.push(
                    `Поле ${code} не установлено — «${label}» пропущено`,
                );
                return;
            }
            const item = field.items.find(it => it.code === itemCode);
            if (!item) {
                warnings.push(`Вариант ${itemCode} не найден в поле ${code}`);
                return;
            }
            fields[portal.getFieldBitrixId(field)] = item.bitrixId;
            applied.push(`${label}: ${item.name}`);
        };
        const setBool = (
            code: EnumLeadRequestFieldCode,
            value: boolean | undefined,
            label: string,
        ) => {
            if (value === undefined) return;
            const field = portal.getEntityFieldByCode('lead', code);
            if (!field) {
                warnings.push(
                    `Поле ${code} не установлено — «${label}» пропущено`,
                );
                return;
            }
            fields[portal.getFieldBitrixId(field)] = value ? 1 : 0;
            applied.push(`${label}: ${value ? 'да' : 'нет'}`);
        };

        setItem(
            EnumLeadRequestFieldCode.op_lead_site_status,
            dto.siteStatusCode,
            'Статус заявки',
        );
        setItem(
            EnumLeadRequestFieldCode.op_lead_site_stage,
            dto.siteStageCode,
            'Стадия заявки',
        );
        setItem(
            EnumLeadRequestFieldCode.op_lead_status,
            dto.leadStatusCode,
            'Статус лида',
        );
        setItem(
            EnumLeadRequestFieldCode.op_lead_not_ca_type,
            dto.notCaTypeCode,
            'Тип не ЦА',
        );
        setItem(
            EnumLeadRequestFieldCode.op_leads_related_base_stage,
            dto.relatedBaseStageCode,
            'Стадия связанной сделки',
        );
        setBool(
            EnumLeadRequestFieldCode.op_lead_is_black_short,
            dto.blackShort,
            'Не звонить никогда',
        );
        setBool(
            EnumLeadRequestFieldCode.op_lead_is_boost_sale,
            dto.boostSale,
            'Повлиял на продажу',
        );
        setBool(
            EnumLeadRequestFieldCode.op_lead_is_npp_repoted,
            dto.nppReported,
            'Отчёт в НПП',
        );
        if (dto.blackShortReason !== undefined) {
            const field = portal.getEntityFieldByCode(
                'lead',
                EnumLeadRequestFieldCode.op_lead_black_short_reason,
            );
            if (field) {
                fields[portal.getFieldBitrixId(field)] = dto.blackShortReason;
                applied.push('Причина «не звонить» обновлена');
            }
        }

        // История: сводка изменений + отдельная заметка менеджера.
        this.queueHistory(portal, lead, fields, applied, dto.historyNote);

        if (Object.keys(fields).length === 0) {
            return {
                success: false,
                applied,
                warnings: [...warnings, 'Нет изменений'],
            };
        }
        await bitrix.lead.update(dto.leadId, fields as never);
        this.logger.log(
            `lead-request update lead=${dto.leadId}: ${applied.join('; ') || 'история'}`,
        );
        return { success: true, applied, warnings };
    }

    /* ------------------------------------------------------------------ */

    private queueHistory(
        portal: PortalModel,
        lead: BxRow,
        fields: BxRow,
        applied: string[],
        note: string | undefined,
    ): void {
        const field = portal.getEntityFieldByCode(
            'lead',
            EnumLeadRequestFieldCode.op_lead_firstprepare_history,
        );
        if (!field) return;
        const bitrixId = portal.getFieldBitrixId(field);
        const tz = portal.getTimezone();

        let history = (
            Array.isArray(lead[bitrixId]) ? lead[bitrixId] : []
        ) as string[];
        if (applied.length) {
            history = appendLeadRequestHistory(
                history,
                buildLeadRequestHistoryEntry(applied.join('; '), tz),
            );
        }
        if (note?.trim()) {
            history = appendLeadRequestHistory(
                history,
                buildLeadRequestHistoryEntry(note.trim(), tz),
            );
        }
        if (history.length) fields[bitrixId] = history;
    }

    /**
     * «Принята ли заявка» (назначение ≠ принятие). Три источника по
     * убыванию надёжности — тот же порядок, что у SLA-крона:
     *
     *  1. `op_lead_assigned_at` — таймер ожидания: пишется при КАЖДОМ
     *     назначении/передаче и очищается принятием. Заполнен = ждёт
     *     подтверждения прямо сейчас. Не зависит ни от истории, ни от
     *     стадии, поэтому переживает ручные правки карточки;
     *  2. история обработки — принятие после ПОСЛЕДНЕГО назначения;
     *  3. стадия заявки — назначена → не принята.
     *
     * Ничего не установлено → true: механики подтверждения на портале нет,
     * блокировать работу менеджера нельзя.
     */
    private isAccepted(
        portal: PortalModel,
        lead: BxRow,
        card: LeadRequestCardDto,
    ): boolean {
        const assignedAtField = portal.getEntityFieldByCode(
            'lead',
            EnumLeadRequestFieldCode.op_lead_assigned_at,
        );
        if (assignedAtField) {
            const raw = lead[portal.getFieldBitrixId(assignedAtField)];
            return !this.text(raw);
        }

        const state = getLeadRequestAcceptState(
            this.fieldRaw(
                portal,
                lead,
                EnumLeadRequestFieldCode.op_lead_firstprepare_history,
            ),
            portal.getTimezone(),
        );
        if (state.acceptedAfterAssign !== null) {
            return state.acceptedAfterAssign;
        }
        const stage = card.siteStage.currentCode;
        if (stage === null) return true;
        return stage !== EnumLeadSiteStageCode.assigned;
    }

    /** Готовность к продаже: что обязано быть отмечено (правило пользователя). */
    private saleReadiness(
        card: LeadRequestCardDto,
    ): LeadRequestCardDto['saleReadiness'] {
        const missing: string[] = [];
        if (card.siteStatus.installed && !card.siteStatus.currentCode) {
            missing.push('Статус заявки');
        }
        if (card.siteStage.installed && !card.siteStage.currentCode) {
            missing.push('Стадия заявки');
        }
        if (card.leadStatus.installed && !card.leadStatus.currentCode) {
            missing.push('Статус лида');
        }
        if (!card.duplicateChecked) {
            missing.push('Проверка на дубли (ИНН)');
        }
        return { ready: missing.length === 0, missing };
    }

    /**
     * Состояние enum-поля лида. Дженерик фиксирует конкретный enum кода —
     * карточка остаётся тотально типизированной без кастов на вызовах.
     * Названия вариантов: живые с портала (live) поверх названий из DB.
     */
    private enumState<TCode extends string>(
        portal: PortalModel,
        lead: BxRow,
        code: EnumLeadRequestFieldCode,
        warnings: string[],
        live: LeadUfDefinitions,
    ): {
        installed: boolean;
        currentCode: TCode | null;
        items: { code: string; name: string }[];
    } {
        const field = portal.getEntityFieldByCode('lead', code);
        if (!field) {
            warnings.push(`Поле ${code} не установлено на портале`);
            return { installed: false, currentCode: null, items: [] };
        }
        const ufName = portal.getFieldBitrixId(field);
        const raw = lead[ufName];
        const current = field.items.find(
            item => String(item.bitrixId) === String(raw),
        );
        const liveByItemId = live[ufName]?.itemNames ?? {};
        return {
            installed: true,
            currentCode: (current?.code as TCode | undefined) ?? null,
            items: field.items.map(item => ({
                code: item.code,
                name: liveByItemId[String(item.bitrixId)] ?? item.name,
            })),
        };
    }

    private bool(
        portal: PortalModel,
        lead: BxRow,
        code: EnumLeadRequestFieldCode,
    ): boolean {
        const raw = this.fieldRaw(portal, lead, code);
        return raw === 1 || raw === '1' || raw === true || raw === 'Y';
    }

    private fieldText(
        portal: PortalModel,
        lead: BxRow,
        code: EnumLeadRequestFieldCode,
    ): string | null {
        return this.text(this.fieldRaw(portal, lead, code));
    }

    private fieldRaw(
        portal: PortalModel,
        lead: BxRow,
        code: EnumLeadRequestFieldCode,
    ): unknown {
        const field = portal.getEntityFieldByCode('lead', code);
        return field ? lead[portal.getFieldBitrixId(field)] : null;
    }

    private history(portal: PortalModel, lead: BxRow): string[] {
        const raw = this.fieldRaw(
            portal,
            lead,
            EnumLeadRequestFieldCode.op_lead_firstprepare_history,
        );
        return (Array.isArray(raw) ? raw : [])
            .map(value => this.text(value) ?? '')
            .filter(Boolean);
    }

    private dealRef(
        portal: PortalModel,
        lead: BxRow,
        code: string,
    ): number | null {
        const field = portal.getEntityFieldByCode('lead', code);
        if (!field) return null;
        const raw = lead[portal.getFieldBitrixId(field)];
        const values = Array.isArray(raw) ? raw : [raw];
        for (const value of values) {
            if (value == null) continue;
            const match = /^(?:D_)?(\d+)$/.exec(String(value).trim());
            if (match) return Number(match[1]);
        }
        return null;
    }

    private numeric(raw: unknown): number | null {
        const value = Number(raw);
        return Number.isFinite(value) && value > 0 ? value : null;
    }

    private text(raw: unknown): string | null {
        if (typeof raw === 'string') return raw.trim() || null;
        if (typeof raw === 'number' || typeof raw === 'bigint') {
            return String(raw);
        }
        return null;
    }
}
