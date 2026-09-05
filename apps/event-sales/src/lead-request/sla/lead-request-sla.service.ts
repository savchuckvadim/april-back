import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { PBXService } from '@/modules/pbx';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { BxDepartmentStructureService } from 'libs/bx-department/services/bx-department-structure.service';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { EnumSalesHookCode } from '../../sales-hooks/core/constants/sales-hook-code.enum';
import { EnumSalesHookSource } from '../../sales-hooks/core/contracts/sales-hook-job.type';
import { SalesHookDispatchService } from '../../sales-hooks/core/services/sales-hook-dispatch.service';
import { SalesHookIdempotencyService } from '../../sales-hooks/core/services/sales-hook-idempotency.service';
import { buildLeadToWorkItem } from '../../sales-hooks/lead-to-work/dto/lead-to-work.dto';
import { buildTransferWorkItem } from '../../sales-hooks/transfer-work/dto/transfer-work.dto';
import { LeadToWorkAssigneeService } from '../../sales-hooks/lead-to-work/services/lead-to-work-assignee.service';
import { dealAssignedAtName } from '../../shared/lead-request/deal-work-timer.util';
import {
    appendLeadRequestHistory,
    buildLeadRequestHistoryEntry,
} from '../../shared/lead-request/lead-request-history.util';
import { EnumLeadRequestFieldCode } from '@lib/portal-lib/pbx/pbx-lead-request/type/pbx-lead-request.enum';
import { LeadRequestAcceptService } from '../services/lead-request-accept.service';

// Плагины idempotent: extend() повторно — no-op (см. lead-request-history.util).
dayjs.extend(utc);
dayjs.extend(timezone);

/** Формат CRM datetime-полей Битрикса (локальное время портала). */
const CRM_DATETIME_FORMAT = 'DD.MM.YYYY HH:mm:ss';

type BxRow = Record<string, unknown>;

/** Итог SLA-прохода по домену (для лога/диагностики). */
export interface LeadRequestSlaRunResult {
    /** Кандидатов в стадии «Назначена» старше порога. */
    candidates: number;
    /** Принятий, доведённых задним числом (менеджер двинул сделку). */
    healed: number;
    /** Передано другому сотруднику. */
    transferred: number;
    /** Сделок с просроченным подтверждением (второй проход, по сделкам). */
    dealCandidates: number;
    /** Сделок передано другому сотруднику. */
    dealsTransferred: number;
    warnings: string[];
}

/**
 * SLA принятия заявки: «не принял за N минут → передать другому и
 * уведомить руководителя».
 *
 * Кандидаты выбираются ПО ЛИДАМ одним индексным запросом — стадия
 * «Назначена менеджеру» (lead_assigned) и есть маркер «требует
 * подтверждения», отдельной стадии не нужно; сколько бы ни было ХО
 * вообще, выборка возвращает только назначенные-непринятые.
 *
 * Reconciliation против потерянных вебхуков: перед передачей смотрим
 * базовую сделку лида — если менеджер РЕАЛЬНО двинул её из «Новая»
 * (а вебхук принятия не долетел), фиксируем принятие задним числом
 * (self-healing) вместо передачи.
 */
@Injectable()
export class LeadRequestSlaService {
    private readonly logger = new Logger(LeadRequestSlaService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly acceptService: LeadRequestAcceptService,
        private readonly dispatch: SalesHookDispatchService,
        private readonly idempotency: SalesHookIdempotencyService,
        private readonly structure: BxDepartmentStructureService,
        /** Round-robin выбор нового ответственного для передачи сделки. */
        private readonly assignee: LeadToWorkAssigneeService,
    ) {}

    async runForDomain(
        domain: string,
        minutes: number,
        maxPerRun: number,
    ): Promise<LeadRequestSlaRunResult> {
        const result: LeadRequestSlaRunResult = {
            candidates: 0,
            healed: 0,
            transferred: 0,
            dealCandidates: 0,
            dealsTransferred: 0,
            warnings: [],
        };
        const { bitrix, PortalModel: portal } = await this.pbx.init(domain);

        const historyField = portal.getEntityFieldByCode(
            'lead',
            EnumLeadRequestFieldCode.op_lead_firstprepare_history,
        );
        const toBaseField = portal.getEntityFieldByCode(
            'lead',
            PBX_SALES_EVENT_FIELD_CODES.to_base_sales,
        );

        const filter = this.buildOverdueFilter(portal, minutes, result);
        const handledDealIds = new Set<number>();

        if (filter) {
            const select = ['ID', 'TITLE', 'ASSIGNED_BY_ID', 'DATE_MODIFY'];
            if (historyField)
                select.push(portal.getFieldBitrixId(historyField));
            if (toBaseField) select.push(portal.getFieldBitrixId(toBaseField));

            const { result: leads } = await bitrix.lead.getList(
                filter as never,
                select,
            );
            const overdue = (leads ?? []).slice(
                0,
                maxPerRun,
            ) as unknown as BxRow[];
            result.candidates = overdue.length;

            const newStageId = this.baseNewStageId(portal);
            const toBaseName = toBaseField
                ? portal.getFieldBitrixId(toBaseField)
                : null;

            for (const lead of overdue) {
                const leadId = Number(lead.ID);
                if (!Number.isFinite(leadId) || leadId <= 0) continue;
                // Базовая сделка лида — её второй проход трогать не должен:
                // лидовый контур уже переназначил по ней работу.
                const baseDealId = toBaseName
                    ? this.parseRef(lead[toBaseName])
                    : null;
                if (baseDealId) handledDealIds.add(baseDealId);
                try {
                    const moved = await this.isBaseDealMoved(
                        bitrix,
                        portal,
                        lead,
                        toBaseName,
                        newStageId,
                    );
                    if (moved) {
                        // Менеджер работает, вебхук принятия потерялся — доводим.
                        await this.acceptService.accept({ domain, leadId });
                        result.healed += 1;
                        continue;
                    }
                    await this.transfer(
                        bitrix,
                        portal,
                        domain,
                        lead,
                        leadId,
                        minutes,
                        historyField
                            ? portal.getFieldBitrixId(historyField)
                            : null,
                        result,
                    );
                } catch (error) {
                    result.warnings.push(
                        `Лид ${leadId}: ${(error as Error).message}`,
                    );
                }
            }
        }

        // === Второй проход: сделки с собственным таймером подтверждения.
        await this.runDealPass(
            bitrix,
            portal,
            domain,
            minutes,
            maxPerRun,
            handledDealIds,
            result,
        );

        this.logger.log(
            `[sla] ${domain}: лиды — просрочено ${result.candidates}, ` +
                `доведено принятий ${result.healed}, передано ${result.transferred}; ` +
                `сделки — просрочено ${result.dealCandidates}, ` +
                `передано ${result.dealsTransferred}`,
        );
        return result;
    }

    /**
     * ВТОРОЙ ПРОХОД — по СДЕЛКАМ с непустым `op_lead_assigned_at`.
     *
     * Таймер сделки живёт своей жизнью: его ставит передача работы
     * (`transfer-work`), снимает принятие, а этот проход — страховка «чтобы
     * момент не потерялся»: даже если очистка где-то не сработала, крон
     * увидит просроченное и перераспределит работу.
     *
     * Защита от двойной обработки одного клиента:
     *  - сделки, уже затронутые лидовым проходом, исключаются по id;
     *  - сделка пропускается, если у её лида-первоисточника СВОЙ таймер ещё
     *    не снят: этим клиентом занимается лидовый контур, и переданная
     *    дважды работа улетела бы к двум разным людям.
     */
    private async runDealPass(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        portal: PortalModel,
        domain: string,
        minutes: number,
        maxPerRun: number,
        handledDealIds: ReadonlySet<number>,
        result: LeadRequestSlaRunResult,
    ): Promise<void> {
        const assignedAtName = dealAssignedAtName(portal);
        if (!assignedAtName) {
            result.warnings.push(
                'Поле «Заявка назначена (дата)» не установлено на СДЕЛКЕ — подтверждение по сделкам не контролируется',
            );
            return;
        }

        const threshold = dayjs()
            .tz(portal.getTimezone())
            .subtract(minutes, 'minute')
            .format(CRM_DATETIME_FORMAT);

        const { result: deals } = await bitrix.deal.getList(
            {
                [`!${assignedAtName}`]: '',
                [`<${assignedAtName}`]: threshold,
                CLOSED: 'N',
            } as never,
            ['ID', 'TITLE', 'ASSIGNED_BY_ID', 'COMPANY_ID', 'LEAD_ID'],
        );
        const overdue = (deals ?? []).slice(0, maxPerRun) as unknown as BxRow[];
        const candidates = overdue.filter(
            deal => !handledDealIds.has(Number(deal.ID)),
        );
        result.dealCandidates = candidates.length;
        if (!candidates.length) return;

        // Лиды кандидатов — одним заходом: если у лида таймер ещё висит,
        // клиентом занимается лидовый контур.
        const busyLeads = await this.leadsWaitingAccept(
            bitrix,
            portal,
            candidates,
        );

        for (const deal of candidates) {
            const dealId = Number(deal.ID);
            if (!Number.isFinite(dealId) || dealId <= 0) continue;
            const leadId = this.acceptService.leadIdFromDealRow(portal, deal);
            if (leadId && busyLeads.has(leadId)) {
                this.logger.log(
                    `[sla] сделка ${dealId} пропущена: лид ${leadId} ещё ждёт подтверждения (двойной передачи не будет)`,
                );
                continue;
            }
            try {
                await this.transferDeal(domain, deal, dealId, minutes, result);
            } catch (error) {
                result.warnings.push(
                    `Сделка ${dealId}: ${(error as Error).message}`,
                );
            }
        }
    }

    /** Лиды кандидатов, у которых СВОЙ таймер подтверждения ещё не снят. */
    private async leadsWaitingAccept(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        portal: PortalModel,
        deals: BxRow[],
    ): Promise<Set<number>> {
        const busy = new Set<number>();
        const leadField = portal.getEntityFieldByCode(
            'lead',
            EnumLeadRequestFieldCode.op_lead_assigned_at,
        );
        if (!leadField) return busy;

        const leadIds = [
            ...new Set(
                deals
                    .map(deal =>
                        this.acceptService.leadIdFromDealRow(portal, deal),
                    )
                    .filter((id): id is number => !!id),
            ),
        ];
        if (!leadIds.length) return busy;

        const name = portal.getFieldBitrixId(leadField);
        const { result: leads } = await bitrix.lead.getList(
            { ID: leadIds, [`!${name}`]: '' } as never,
            ['ID'],
        );
        for (const lead of (leads ?? []) as unknown as BxRow[]) {
            const id = Number(lead.ID);
            if (Number.isFinite(id) && id > 0) busy.add(id);
        }
        return busy;
    }

    /**
     * Передача просроченной СДЕЛКИ другому сотруднику — тем же хуком
     * «передать работу», которым пользуется UI. Он же поставит новый таймер
     * ожидания, так что подтвердить обязан уже новый ответственный.
     */
    private async transferDeal(
        domain: string,
        deal: BxRow,
        dealId: number,
        minutes: number,
        result: LeadRequestSlaRunResult,
    ): Promise<void> {
        const previous = Number(deal.ASSIGNED_BY_ID) || null;
        const department = previous
            ? await this.findUserDepartment(domain, previous)
            : null;

        const assignee = await this.assignee.resolve(domain, {
            // leadId у синтетического элемента используется только в логах
            // распределителя — передаём id сделки, чтобы строка читалась.
            leadId: dealId,
            department: department?.departmentId
                ? String(department.departmentId)
                : undefined,
            excludeResponsible: previous ?? undefined,
            createCompany: 'N',
            stageMode: 'from_lead',
            taskMode: 'move',
            isXo: 'N',
        });
        if (!assignee.responsible) {
            result.warnings.push(
                `Сделка ${dealId}: некому передать (${assignee.warnings.join('; ') || 'кандидатов нет'})`,
            );
            return;
        }

        const entityKey = `deal:${dealId}`;
        const item = buildTransferWorkItem('give', {
            domain,
            dealIds: [dealId],
            newResponsibleId: assignee.responsible,
        } as never);
        const operation = await this.dispatch.accept(
            EnumSalesHookCode.TRANSFER_WORK,
            domain,
            EnumSalesHookSource.ROBOT,
            [
                {
                    entityKey,
                    fingerprint: this.idempotency.fingerprint(
                        EnumSalesHookCode.TRANSFER_WORK,
                        entityKey,
                        { sla: true, ...item },
                    ),
                    data: item,
                },
            ],
        );
        if (!operation) {
            result.warnings.push(
                `Сделка ${dealId}: передача уже выполняется другой операцией`,
            );
            return;
        }
        result.dealsTransferred += 1;
        this.logger.log(
            `[sla] сделка ${dealId} не подтверждена за ${minutes} мин → ` +
                `передана ${assignee.responsible} (было ${previous ?? '—'})`,
        );
    }

    /**
     * Фильтр «нераспределённые заявки, просрочившие принятие».
     *
     * ОСНОВНОЙ путь — по НАШИМ полям, которые пишет только хук назначения:
     *  - `op_lead_assigned_at` ЗАПОЛНЕНО и старше порога — заявка ждёт
     *    подтверждения дольше N минут. Принятие поле очищает, поэтому
     *    принятые выпадают из выборки автоматически. Это ЕДИНСТВЕННЫЙ
     *    признак ожидания — тот же, по которому фрейм показывает экран
     *    подтверждения, поэтому UI и крон не расходятся;
     *  - `op_lead_site_status` ЗАПОЛНЕН — это именно ЗАЯВКА (метку ставит
     *    только наш хук распознанной заявке), а не любой лид. Раньше тем же
     *    признаком была site_stage — ось слита в site_status (аудит 2408),
     *    stage больше не пишется.
     * Стадия лида здесь НЕ участвует: её двигают конструктор, роботы и
     * менеджеры руками — опираться на неё как на признак ненадёжно.
     *
     * Почему «стадия заполнена», а не «стадия = Назначена менеджеру»:
     * метки заявки пишутся ТОЛЬКО в пустые поля (путь заявки не
     * переписывается задним числом), поэтому у уже принятой и потом
     * переданной другому заявки стадия остаётся «Взята в работу». По
     * равенству «Назначена» такая передача была невидима крону: фрейм
     * блокировал экран подтверждением, а SLA молчал.
     *
     * FALLBACK (поля ещё не установлены на портале) — прежний механизм по
     * стадии `lead_assigned` + DATE_MODIFY, с предупреждением: он грубее,
     * потому что DATE_MODIFY сбивает любая правка карточки.
     */
    private buildOverdueFilter(
        portal: PortalModel,
        minutes: number,
        result: LeadRequestSlaRunResult,
    ): Record<string, unknown> | null {
        const assignedAtField = portal.getEntityFieldByCode(
            'lead',
            EnumLeadRequestFieldCode.op_lead_assigned_at,
        );
        const siteStatusField = portal.getEntityFieldByCode(
            'lead',
            EnumLeadRequestFieldCode.op_lead_site_status,
        );

        if (assignedAtField) {
            const assignedAtName = portal.getFieldBitrixId(assignedAtField);
            const threshold = dayjs()
                .tz(portal.getTimezone())
                .subtract(minutes, 'minute')
                .format(CRM_DATETIME_FORMAT);
            const filter: Record<string, unknown> = {
                [`!${assignedAtName}`]: '',
                [`<${assignedAtName}`]: threshold,
            };

            // Сужаем до заявок: метку статуса ставит только наш хук.
            if (siteStatusField) {
                filter[`!${portal.getFieldBitrixId(siteStatusField)}`] = '';
            }
            return filter;
        }

        const assignedStatusId = portal.getLeadStatusIdByCode('lead_assigned');
        if (!assignedStatusId) {
            result.warnings.push(
                'Ни поле «Заявка назначена (дата)», ни стадия «Назначена менеджеру» не установлены — SLA-контроль невозможен',
            );
            return null;
        }
        result.warnings.push(
            'Поле «Заявка назначена (дата)» не установлено — SLA работает по стадии и DATE_MODIFY (грубее: правка карточки сбивает таймер)',
        );
        return {
            STATUS_ID: assignedStatusId,
            '<DATE_MODIFY': dayjs().subtract(minutes, 'minute').toISOString(),
        };
    }

    /** `C{cat}:{stage}` стадии «Новая» воронки ОП; null — не сконфигурирована. */
    private baseNewStageId(portal: PortalModel): string | null {
        const category = portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        const stage = category?.stages.find(item => item.code === 'sales_new');
        return category && stage
            ? `C${category.bitrixId}:${stage.bitrixId}`
            : null;
    }

    /**
     * Менеджер реально двинул свою сделку из «Новая»? Тогда он принял
     * работу, просто сигнал не долетел. Сделки/стадии нет — считаем, что
     * не двигал (передача по времени валидна).
     */
    private async isBaseDealMoved(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        portal: PortalModel,
        lead: BxRow,
        toBaseBitrixId: string | null,
        newStageId: string | null,
    ): Promise<boolean> {
        if (!toBaseBitrixId || !newStageId) return false;
        const dealId = this.parseRef(lead[toBaseBitrixId]);
        if (!dealId) return false;
        const deal = (await bitrix.deal.get(dealId))?.result as
            | BxRow
            | undefined;
        if (!deal) return false;
        const stage = typeof deal.STAGE_ID === 'string' ? deal.STAGE_ID : '';
        return stage !== '' && stage !== newStageId;
    }

    /** Передача: история → повторный ХО (round-robin) → алерт руководителю. */
    private async transfer(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        portal: PortalModel,
        domain: string,
        lead: BxRow,
        leadId: number,
        minutes: number,
        historyBitrixId: string | null,
        result: LeadRequestSlaRunResult,
    ): Promise<void> {
        const prevResponsible = Number(lead.ASSIGNED_BY_ID) || null;

        // 1. Причина передачи — в историю ДО передачи (хук допишет «ХО передан»).
        if (historyBitrixId) {
            await bitrix.lead.update(leadId, {
                [historyBitrixId]: appendLeadRequestHistory(
                    lead[historyBitrixId],
                    buildLeadRequestHistoryEntry(
                        `Не принял за ${minutes} мин: ${prevResponsible ?? '—'}`,
                        portal.getTimezone(),
                    ),
                ),
            } as never);
        }

        // 2. Отдел прежнего ответственного — передаём внутри него.
        const departmentHint = prevResponsible
            ? await this.findUserDepartment(domain, prevResponsible)
            : null;

        // 3. Повторный ХО = передача (закрыть-передать + KPI + round-robin).
        // Прежний ответственный исключается — заявка не вернётся ему же.
        const item = buildLeadToWorkItem({
            leadId,
            isXo: 'Y',
            stageMode: 'new',
            taskMode: 'close',
            excludeResponsible: prevResponsible ?? undefined,
            department: departmentHint?.departmentId
                ? String(departmentHint.departmentId)
                : undefined,
        });
        const entityKey = `lead:${leadId}`;
        const operation = await this.dispatch.accept(
            EnumSalesHookCode.LEAD_TO_WORK,
            domain,
            EnumSalesHookSource.ROBOT,
            [
                {
                    entityKey,
                    fingerprint: this.idempotency.fingerprint(
                        EnumSalesHookCode.LEAD_TO_WORK,
                        entityKey,
                        { sla: true, ...item },
                    ),
                    data: item,
                },
            ],
        );
        if (!operation) {
            result.warnings.push(
                `Лид ${leadId}: передача уже выполняется другой операцией`,
            );
            return;
        }
        result.transferred += 1;

        // 4. Уведомление руководителю отдела прежнего ответственного.
        await this.notifyHead(
            bitrix,
            domain,
            lead,
            leadId,
            minutes,
            prevResponsible,
            departmentHint?.headUserIds ?? [],
            result,
        );
    }

    /** ОП сотрудника: id отдела + руководители (HEADS: руководитель и заместители). */
    private async findUserDepartment(
        domain: string,
        userId: number,
    ): Promise<{ departmentId: number | null; headUserIds: number[] }> {
        try {
            const data = await this.structure.getStructure(
                domain,
                EDepartamentGroup.sales,
                0,
            );
            for (const sales of data.salesDepartments ?? []) {
                const hasUser = (sales.allUsers ?? []).some(
                    user => Number(user?.ID) === userId,
                );
                if (!hasUser) continue;
                return {
                    departmentId: Number(sales.department?.ID) || null,
                    headUserIds: this.headsOf(sales.department),
                };
            }
        } catch (error) {
            this.logger.warn(
                `Структура отделов ${domain} не прочитана: ${(error as Error).message}`,
            );
        }
        return { departmentId: null, headUserIds: [] };
    }

    /** Руководители отдела из HEADS; ответ без списка — легаси UF_HEAD. */
    private headsOf(department?: {
        HEADS?: number[];
        UF_HEAD?: number | null;
    }): number[] {
        const heads = (department?.HEADS ?? [])
            .map(Number)
            .filter(id => Number.isInteger(id) && id > 0);
        if (heads.length > 0) return heads;
        const legacy = Number(department?.UF_HEAD);
        return Number.isInteger(legacy) && legacy > 0 ? [legacy] : [];
    }

    private async notifyHead(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        domain: string,
        lead: BxRow,
        leadId: number,
        minutes: number,
        prevResponsible: number | null,
        headUserIds: number[],
        result: LeadRequestSlaRunResult,
    ): Promise<void> {
        if (headUserIds.length === 0) {
            result.warnings.push(
                `Лид ${leadId}: руководитель отдела не найден — уведомление не отправлено`,
            );
            return;
        }
        const title =
            typeof lead.TITLE === 'string' ? lead.TITLE : `Лид ${leadId}`;
        const message =
            `Заявка «${title}» не принята сотрудником за ${minutes} мин` +
            (prevResponsible ? ` (ответственный: ${prevResponsible})` : '') +
            ` — передана другому. [URL=https://${domain}/crm/lead/details/${leadId}/]Открыть лид[/URL]`;
        // Все руководители отдела (руководитель + заместители): сбой
        // одного адресата не отменяет остальных.
        for (const headUserId of headUserIds) {
            try {
                await bitrix.imNotify.systemAdd({
                    USER_ID: headUserId,
                    MESSAGE: message,
                });
            } catch (error) {
                result.warnings.push(
                    `Лид ${leadId}: уведомление руководителю ${headUserId} не отправлено — ${(error as Error).message}`,
                );
            }
        }
    }

    /** `D_123` / `123` (в т.ч. multiple) → id. */
    private parseRef(raw: unknown): number | null {
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
