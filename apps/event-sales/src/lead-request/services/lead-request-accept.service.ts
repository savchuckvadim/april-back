import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { PbxSalesEventFieldCode } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';
import {
    EnumLeadRequestFieldCode,
    EnumLeadSiteStageCode,
    EnumLeadSiteStatusCode,
} from '@lib/portal-lib/pbx/pbx-lead-request/type/pbx-lead-request.enum';
import {
    appendLeadRequestHistory,
    buildLeadRequestHistoryEntry,
    getLeadRequestAcceptState,
    LEAD_REQUEST_HISTORY_TEXT,
} from '../../shared/lead-request/lead-request-history.util';
import {
    LeadRequestAcceptDto,
    LeadRequestAcceptResultDto,
} from '../dto/lead-request-accept.dto';

type BxRow = Record<string, unknown>;

/** Целевая стадия лида при принятии (аксиома: назначение ≠ принятие). */
const ACCEPT_LEAD_STAGE_CODE = 'lead_taken_in_work';

/** Принятая сделка встаёт «окончательно в ХО» — стадия «Холодная». */
const ACCEPT_DEAL_STAGE_CODE = 'sales_cold';

/**
 * ПЛАН принятия одного лида — чистый расчёт без I/O. Нужен двум
 * потребителям: одиночной ручке (кнопка UI) и ПАЧЕЧНОМУ хуку
 * (sales-hooks/lead-accept), который сам batch-читает лиды и batch-пишет
 * план через буфер — предобработка хука экономит сотни вызовов.
 */
export interface LeadAcceptPlan {
    /** Уже принята после последнего назначения — писать нечего. */
    already: boolean;
    /** Поля lead.update (пусто при already или неустановленных полях). */
    fields: BxRow;
    firstprepareSeconds: number | null;
    warnings: string[];
    /** Движение базовой сделки в «Холодную»; null — нечего/нет конфига. */
    dealMove: { dealId: number; stageId: string } | null;
}

/**
 * Принятие заявки менеджером — вторая точка пути
 * «Назначена → ПРИНЯТА → … → обнаружена компания (финал)».
 *
 * Действия (все graceful — нет поля/стадии → скип с warning):
 *  - стадия лида → «Взята в работу»; базовая сделка → «Холодная»;
 *  - site_status/site_stage → «Взята в работу»;
 *  - op_lead_firstprepare_long = секунды от последнего «ХО назначен/
 *    передан» в истории до принятия (только если поле пусто);
 *  - история += «Заявка принята в работу».
 *
 * Идемпотентность: принятие валидно только ПОСЛЕ последнего назначения
 * (после передачи другому — принимать заново); повтор → already=true.
 */
@Injectable()
export class LeadRequestAcceptService {
    private readonly logger = new Logger(LeadRequestAcceptService.name);

    constructor(private readonly pbx: PBXService) {}

    /** Одиночное принятие (кнопка UI): чтение → план → запись. */
    async accept(
        dto: LeadRequestAcceptDto,
    ): Promise<LeadRequestAcceptResultDto> {
        if (!dto.leadId && !dto.dealId) {
            throw new BadRequestException(
                'Нужен leadId либо dealId — иначе непонятно, какую заявку принимать',
            );
        }
        const { bitrix, PortalModel: portal } = await this.pbx.init(dto.domain);

        // Менеджер живёт в воронке сделок: робот шлёт dealId, лид — по связям.
        const leadId =
            dto.leadId ??
            this.leadIdFromDealRow(
                portal,
                (await bitrix.deal.get(dto.dealId!))?.result as
                    | BxRow
                    | undefined,
            );
        if (!leadId) {
            throw new NotFoundException(
                `У сделки ${dto.dealId} не найден лид-первоисточник (deal_from_lead_id/LEAD_ID)`,
            );
        }

        const lead = (await bitrix.lead.get(leadId))?.result as
            | BxRow
            | undefined;
        if (!lead) {
            throw new NotFoundException(`Лид ${leadId} не найден на портале`);
        }

        const plan = this.plan(portal, lead, dto.userId, dto.dealId);
        if (plan.already) {
            return {
                success: true,
                already: true,
                firstprepareSeconds: null,
                warnings: plan.warnings,
            };
        }
        if (Object.keys(plan.fields).length === 0) {
            plan.warnings.push(
                'Ни одно поле принятия не установлено на портале — принятие не зафиксировано',
            );
            return {
                success: false,
                already: false,
                firstprepareSeconds: null,
                warnings: plan.warnings,
            };
        }

        await bitrix.lead.update(leadId, plan.fields as never);
        if (plan.dealMove) {
            await bitrix.deal.update(plan.dealMove.dealId, {
                STAGE_ID: plan.dealMove.stageId,
            } as never);
        }

        this.logger.log(
            `[accept] lead=${leadId} принята (user=${dto.userId ?? '—'}, ` +
                `firstprepare=${plan.firstprepareSeconds ?? '—'}с)`,
        );
        return {
            success: true,
            already: false,
            firstprepareSeconds: plan.firstprepareSeconds,
            warnings: plan.warnings,
        };
    }

    /**
     * План принятия по УЖЕ ПРОЧИТАННОМУ лиду — ни одного вызова Битрикса.
     * Пачечный хук зовёт его на каждый лид после общего batch-чтения.
     */
    plan(
        portal: PortalModel,
        lead: BxRow,
        userId?: number,
        explicitDealId?: number,
    ): LeadAcceptPlan {
        const warnings: string[] = [];
        const tz = portal.getTimezone();
        const acceptState = getLeadRequestAcceptState(
            this.fieldRaw(
                portal,
                lead,
                EnumLeadRequestFieldCode.op_lead_firstprepare_history,
            ),
            tz,
        );
        if (acceptState.acceptedAfterAssign === true) {
            return {
                already: true,
                fields: {},
                firstprepareSeconds: null,
                warnings,
                dealMove: null,
            };
        }

        const fields: BxRow = {};

        // Стадия лида: «Взята в работу» (источник истины принятия).
        const statusId = portal.getLeadStatusIdByCode(ACCEPT_LEAD_STAGE_CODE);
        if (statusId) {
            fields.STATUS_ID = statusId;
        } else {
            warnings.push(
                'Стадия «Взята в работу» не установлена — статус лида не изменён',
            );
        }

        this.setItem(
            portal,
            fields,
            EnumLeadRequestFieldCode.op_lead_site_status,
            EnumLeadSiteStatusCode.taken,
            warnings,
        );
        this.setItem(
            portal,
            fields,
            EnumLeadRequestFieldCode.op_lead_site_stage,
            EnumLeadSiteStageCode.taken,
            warnings,
        );

        const firstprepareSeconds = this.planFirstprepare(
            portal,
            lead,
            fields,
            acceptState.lastAssignedAt,
            warnings,
        );

        /*
         * Снимаем таймер SLA: op_lead_assigned_at — «заявка ждёт принятия
         * с этого момента». Пустое поле = ждать больше нечего, и cron её
         * не увидит вообще (фильтр идёт по заполненности, а не по стадии,
         * которую могут двигать конструктор/роботы/руками).
         */
        const assignedAtField = portal.getEntityFieldByCode(
            'lead',
            EnumLeadRequestFieldCode.op_lead_assigned_at,
        );
        if (assignedAtField) {
            fields[portal.getFieldBitrixId(assignedAtField)] = '';
        }

        // История: запись принятия (append-only от текущего значения).
        // Кто принял: явный userId (кнопка UI), иначе ответственный лида —
        // вебхук робота userId не шлёт, а принять обязан именно назначенный
        // (ХО-хук при назначении/передаче ставит его в ASSIGNED_BY_ID).
        const acceptedBy = userId ?? this.parsePositiveInt(lead.ASSIGNED_BY_ID);
        const historyField = portal.getEntityFieldByCode(
            'lead',
            EnumLeadRequestFieldCode.op_lead_firstprepare_history,
        );
        if (historyField) {
            const bitrixId = portal.getFieldBitrixId(historyField);
            fields[bitrixId] = appendLeadRequestHistory(
                lead[bitrixId],
                buildLeadRequestHistoryEntry(
                    LEAD_REQUEST_HISTORY_TEXT.accepted(acceptedBy),
                    tz,
                ),
            );
        }

        return {
            already: false,
            fields,
            firstprepareSeconds,
            warnings,
            dealMove: this.planDealMove(portal, lead, explicitDealId, warnings),
        };
    }

    /** Лид-первоисточник по строке сделки: deal_from_lead_id → LEAD_ID. */
    leadIdFromDealRow(
        portal: PortalModel,
        deal: BxRow | undefined,
    ): number | null {
        if (!deal) return null;
        const fromLeadField = portal.getEntityFieldByCode(
            'deal',
            PBX_SALES_EVENT_FIELD_CODES.deal_from_lead_id,
        );
        const candidates: unknown[] = [
            fromLeadField ? deal[portal.getFieldBitrixId(fromLeadField)] : null,
            deal.LEAD_ID,
        ];
        for (const raw of candidates.flat()) {
            if (typeof raw !== 'string' && typeof raw !== 'number') continue;
            const match = /^(?:L_)?(\d+)$/.exec(String(raw).trim());
            if (match && Number(match[1]) > 0) return Number(match[1]);
        }
        return null;
    }

    /**
     * Движение базовой сделки (dealId вызова либо to_base_sales лида) в
     * «Холодную». Воронка/стадия не сконфигурированы — warning, без move.
     */
    private planDealMove(
        portal: PortalModel,
        lead: BxRow,
        explicitDealId: number | undefined,
        warnings: string[],
    ): { dealId: number; stageId: string } | null {
        const dealId =
            explicitDealId ??
            this.parseDealRef(
                this.fieldRaw(
                    portal,
                    lead,
                    PBX_SALES_EVENT_FIELD_CODES.to_base_sales,
                ),
            );
        if (!dealId) return null;

        const category = portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        const stage = category?.stages.find(
            item => item.code === ACCEPT_DEAL_STAGE_CODE,
        );
        if (!category || !stage) {
            warnings.push(
                'Стадия «Холодная» воронки ОП не сконфигурирована — сделка не передвинута',
            );
            return null;
        }
        return { dealId, stageId: `C${category.bitrixId}:${stage.bitrixId}` };
    }

    /**
     * Время первичной обработки: секунды от последнего назначения до
     * сейчас. Пишется только если поле установлено и ПУСТО — повторные
     * передачи firstprepare не перетирают.
     */
    private planFirstprepare(
        portal: PortalModel,
        lead: BxRow,
        fields: BxRow,
        lastAssignedAt: Date | null,
        warnings: string[],
    ): number | null {
        const field = portal.getEntityFieldByCode(
            'lead',
            EnumLeadRequestFieldCode.op_lead_firstprepare_long,
        );
        if (!field) return null;
        const bitrixId = portal.getFieldBitrixId(field);

        const current = Number(lead[bitrixId]);
        if (Number.isFinite(current) && current > 0) return null;

        if (!lastAssignedAt) {
            warnings.push(
                'В истории нет записи назначения ХО — время первичной обработки не вычислено',
            );
            return null;
        }
        const seconds = Math.max(
            0,
            Math.round((Date.now() - lastAssignedAt.getTime()) / 1000),
        );
        fields[bitrixId] = seconds;
        return seconds;
    }

    /** item-код → bitrixId значения; нет поля/варианта — warning + скип. */
    private setItem(
        portal: PortalModel,
        fields: BxRow,
        code: EnumLeadRequestFieldCode,
        itemCode: string,
        warnings: string[],
    ): void {
        const field = portal.getEntityFieldByCode('lead', code);
        if (!field) {
            warnings.push(`Поле ${code} не установлено — метка пропущена`);
            return;
        }
        const item = field.items.find(it => it.code === itemCode);
        if (!item) {
            warnings.push(`Вариант ${itemCode} не найден в поле ${code}`);
            return;
        }
        fields[portal.getFieldBitrixId(field)] = item.bitrixId;
    }

    private fieldRaw(
        portal: PortalModel,
        lead: BxRow,
        code: EnumLeadRequestFieldCode | PbxSalesEventFieldCode,
    ): unknown {
        const field = portal.getEntityFieldByCode('lead', code);
        return field ? lead[portal.getFieldBitrixId(field)] : null;
    }

    /** Положительное целое из сырого значения Битрикса (строка/число). */
    private parsePositiveInt(raw: unknown): number | null {
        const value = Number(raw);
        return Number.isFinite(value) && value > 0 ? value : null;
    }

    /** `D_123` / `123` (в т.ч. multiple) → id сделки. */
    private parseDealRef(raw: unknown): number | null {
        const values = Array.isArray(raw) ? raw : [raw];
        for (const value of values) {
            if (typeof value !== 'string' && typeof value !== 'number') {
                continue;
            }
            const match = /^(?:D_)?(\d+)$/.exec(String(value).trim());
            if (match) return Number(match[1]);
        }
        return null;
    }
}
