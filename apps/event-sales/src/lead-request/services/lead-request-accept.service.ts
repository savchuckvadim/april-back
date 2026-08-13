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
    appendDealHistory,
    clearDealAssignedAt,
    dealAssignedAtName,
} from '../../shared/lead-request/deal-work-timer.util';
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
    /**
     * Запись в базовую сделку: стадия «Холодная» + зеркальная строка
     * истории. null — сделки нет либо писать нечего.
     */
    dealUpdate: { dealId: number; fields: BxRow } | null;
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
        let dealRow: BxRow | null = null;
        if (dto.dealId) {
            dealRow =
                ((await bitrix.deal.get(dto.dealId))?.result as
                    | BxRow
                    | undefined) ?? null;
        }
        const leadId =
            dto.leadId ?? this.leadIdFromDealRow(portal, dealRow ?? undefined);

        /*
         * Сделка БЕЗ лида-первоисточника — законный случай: таймер
         * подтверждения ставит передача работы, и заполнить его может любая
         * сделка (к заявкам это отношения не имеет). Раньше здесь летела
         * 404 — подтвердить такую сделку было нечем, и SLA забирал бы её у
         * менеджера, который её уже принял.
         */
        if (!leadId) {
            if (!dto.dealId || !dealRow) {
                throw new NotFoundException(
                    `Сделка ${dto.dealId} не найдена на портале`,
                );
            }
            return this.acceptDealOnly(
                bitrix,
                portal,
                dto.dealId,
                dealRow,
                dto.userId,
            );
        }

        const lead = (await bitrix.lead.get(leadId))?.result as
            | BxRow
            | undefined;
        if (!lead) {
            throw new NotFoundException(`Лид ${leadId} не найден на портале`);
        }

        /*
         * Сделку читаем и когда пришёл leadId: зеркальная запись истории
         * идёт в multiple-поле, которое update перезаписывает целиком —
         * без текущего значения мы стёрли бы историю сделки.
         */
        if (!dealRow) {
            const dealId = this.baseDealIdOf(portal, lead, dto.dealId);
            if (dealId) {
                dealRow =
                    ((await bitrix.deal.get(dealId))?.result as
                        | BxRow
                        | undefined) ?? null;
            }
        }

        const plan = this.plan(portal, lead, dto.userId, dto.dealId, dealRow);
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
        if (plan.dealUpdate) {
            await bitrix.deal.update(
                plan.dealUpdate.dealId,
                plan.dealUpdate.fields as never,
            );
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

    /** Принятие СДЕЛКИ без лида: снять таймер ожидания + история. */
    private async acceptDealOnly(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        portal: PortalModel,
        dealId: number,
        dealRow: BxRow,
        userId?: number,
    ): Promise<LeadRequestAcceptResultDto> {
        const plan = this.planDealOnly(portal, dealId, dealRow, userId);
        if (plan.already || !plan.dealUpdate) {
            return {
                success: true,
                already: true,
                firstprepareSeconds: null,
                warnings: plan.warnings,
            };
        }
        await bitrix.deal.update(dealId, plan.dealUpdate.fields as never);
        this.logger.log(
            `[accept] deal=${dealId} подтверждена (user=${userId ?? '—'})`,
        );
        return {
            success: true,
            already: false,
            firstprepareSeconds: null,
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
        /** Текущее состояние базовой сделки — нужно для append истории. */
        dealRow: BxRow | null = null,
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
                dealUpdate: null,
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
            dealUpdate: this.planDealUpdate(
                portal,
                lead,
                explicitDealId,
                acceptedBy,
                dealRow,
                warnings,
            ),
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

    /** Базовая сделка заявки: dealId вызова либо to_base_sales лида. */
    baseDealIdOf(
        portal: PortalModel,
        lead: BxRow,
        explicitDealId?: number,
    ): number | null {
        return (
            explicitDealId ??
            this.parseDealRef(
                this.fieldRaw(
                    portal,
                    lead,
                    PBX_SALES_EVENT_FIELD_CODES.to_base_sales,
                ),
            )
        );
    }

    /**
     * Что пишем в базовую сделку при принятии: стадия «Холодная» и
     * зеркальная запись истории.
     *
     * Зеркало нужно потому, что менеджер живёт в воронке СДЕЛОК и в лид не
     * заходит: без него путь заявки виден только в лиде. Пишем в
     * `op_mhistory` — то самое множественное поле истории, которое уже
     * ведёт отчётность ОП, поэтому события заявки встают в общую ленту.
     *
     * `dealRow` — текущее состояние сделки. Без него историю НЕ пишем:
     * multiple-поле при update перезаписывается целиком, и запись вслепую
     * стёрла бы всю прошлую историю сделки.
     */
    private planDealUpdate(
        portal: PortalModel,
        lead: BxRow,
        explicitDealId: number | undefined,
        acceptedBy: number | null,
        dealRow: BxRow | null,
        warnings: string[],
    ): { dealId: number; fields: BxRow } | null {
        const dealId = this.baseDealIdOf(portal, lead, explicitDealId);
        if (!dealId) return null;

        const fields: BxRow = {};
        const category = portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        const stage = category?.stages.find(
            item => item.code === ACCEPT_DEAL_STAGE_CODE,
        );
        if (category && stage) {
            fields.STAGE_ID = `C${category.bitrixId}:${stage.bitrixId}`;
        } else {
            warnings.push(
                'Стадия «Холодная» воронки ОП не сконфигурирована — сделка не передвинута',
            );
        }

        this.applyDealAccept(portal, fields, dealRow, acceptedBy);

        return Object.keys(fields).length ? { dealId, fields } : null;
    }

    /**
     * Общая часть принятия для СДЕЛКИ: снять таймер ожидания и дописать
     * историю. Вынесено отдельно, потому что вызывается из двух путей —
     * принятия заявки (у сделки есть лид) и принятия сделки без лида.
     * Точка снятия таймера обязана быть ОДНА, иначе её можно обойти.
     */
    private applyDealAccept(
        portal: PortalModel,
        fields: BxRow,
        dealRow: BxRow | null,
        acceptedBy: number | null,
    ): void {
        clearDealAssignedAt(portal, fields);
        appendDealHistory(
            portal,
            fields,
            dealRow,
            LEAD_REQUEST_HISTORY_TEXT.accepted(acceptedBy),
        );
    }

    /**
     * План принятия СДЕЛКИ БЕЗ ЛИДА.
     *
     * Таймер `op_lead_assigned_at` на сделке к заявкам отношения не имеет:
     * его ставит передача работы, и заполнить его может любая сделка. Здесь
     * только снимаем ожидание и пишем историю — стадию НЕ трогаем: сделка
     * могла ждать подтверждения на любом этапе воронки, и «Холодная» тут
     * была бы откатом работы назад.
     *
     * `already` = таймер уже пуст: подтверждать нечего (идемпотентность).
     */
    planDealOnly(
        portal: PortalModel,
        dealId: number,
        dealRow: BxRow,
        userId?: number,
    ): LeadAcceptPlan {
        const warnings: string[] = [];
        const assignedAtName = dealAssignedAtName(portal);
        if (!assignedAtName) {
            warnings.push(
                'Поле «Заявка назначена (дата)» не установлено на сделке — подтверждать нечего',
            );
            return {
                already: true,
                fields: {},
                firstprepareSeconds: null,
                warnings,
                dealUpdate: null,
            };
        }
        const waiting = this.text(dealRow[assignedAtName]);
        if (!waiting) {
            return {
                already: true,
                fields: {},
                firstprepareSeconds: null,
                warnings,
                dealUpdate: null,
            };
        }

        const acceptedBy =
            userId ?? this.parsePositiveInt(dealRow.ASSIGNED_BY_ID);
        const fields: BxRow = {};
        this.applyDealAccept(portal, fields, dealRow, acceptedBy);

        return {
            already: false,
            fields: {},
            firstprepareSeconds: null,
            warnings,
            dealUpdate: { dealId, fields },
        };
    }

    private text(raw: unknown): string {
        return typeof raw === 'string' ? raw.trim() : '';
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
