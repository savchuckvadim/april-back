import { Injectable, Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { BxDepartmentStructureService } from '@lib/bx-department';
import { BxDepartmentStructureResponseDto } from '@lib/bx-department/dto/bx-department-structure.dto';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { entityTitleOr } from '../../../shared/bitrix/crm-entity-name.util';
import { EventSalesFlowDto } from '../../dto/event-sale-flow/event-sales-flow.dto';
import { EventReportContext } from '../context/event-report.context';
import { ActingManagerMark } from './acting-manager.mark';
import {
    buildActingManagerNotification,
    INotificationCard,
    NotificationOutcome,
} from './acting-manager-notification.formatter';

/** Тег уведомления: повтор по той же задаче замещает прежнее. */
const NOTIFY_TAG_PREFIX = 'event-sales-acting-manager';

const toId = (raw: unknown): number => {
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : 0;
};

interface INamedUser {
    ID?: number | string;
    NAME?: string;
    LAST_NAME?: string;
}

/**
 * РЕЖИМ РУКОВОДИТЕЛЯ: кто отчитался за сотрудника.
 *
 * Отчёт по делу сотрудника идёт от имени сотрудника — фронт присылает его
 * в `plan.responsibility`, а руководителя отдельным полем `actingManager`.
 * Поэтому чувствительные алгоритмы потока (сделки, задачи, KPI, ключ
 * финала) здесь НЕ меняются вовсе. Сервис отвечает только за два шага:
 *  - {@link resolve} — проверить пометку по структуре отдела продаж;
 *  - {@link notify} — уведомить сотрудника после отправки отчёта.
 *
 * Проверка — согласованность, а не защита: id приходят с клиента. Поэтому
 * неподтверждённая роль пометку не снимает (кто отправил отчёт — правда в
 * любом случае), а только убирает из неё слово «руководитель».
 *
 * `@Injectable`, но инстанс Битрикса в поля не кладём: для уведомления он
 * приходит параметром (CLAUDE.md — иначе гонка между порталами).
 */
@Injectable()
export class EventReportActingManagerService {
    private readonly logger = new Logger(EventReportActingManagerService.name);

    constructor(private readonly structure: BxDepartmentStructureService) {}

    /** Пометка отчёта; null — отчёт обычный (за себя или без поля). */
    async resolve(dto: EventSalesFlowDto): Promise<ActingManagerMark | null> {
        const managerId = toId(dto.actingManager?.ID);
        if (!managerId) return null;

        const employeeId = toId(dto.plan?.responsibility?.ID);
        // Отчёт за самого себя режимом руководителя не является.
        if (!employeeId || employeeId === managerId) return null;

        const fallbackName = dto.actingManager?.NAME?.trim() ?? '';
        try {
            const response = await this.structure.getStructure(
                dto.domain,
                EDepartamentGroup.sales,
                managerId,
            );
            const isConfirmedHead =
                response.currentUser.subordinateIds.includes(employeeId);
            if (!isConfirmedHead) {
                this.logger.warn(
                    `[${dto.domain}] отчёт за сотрудника ${employeeId} отправил ` +
                        `${managerId}, но сотрудник не в его подчинении`,
                );
            }
            return {
                id: managerId,
                name: nameFromStructure(response, managerId) || fallbackName,
                isConfirmedHead,
            };
        } catch (error) {
            this.logger.warn(
                `[${dto.domain}] структура отдела не прочитана, роль ` +
                    `${managerId} не подтверждена: ${(error as Error).message}`,
            );
            return {
                id: managerId,
                name: fallbackName,
                isConfirmedHead: false,
            };
        }
    }

    /**
     * Уведомление сотруднику — ПОСЛЕ основного батча (im.notify не
     * батчится). Ошибка отправки гасится: отчёт уже состоялся.
     */
    async notify(
        ctx: EventReportContext,
        bitrix: BitrixService,
    ): Promise<void> {
        const manager = ctx.actingManager;
        if (!manager) return;

        const recipients = this.recipients(ctx, manager.id);
        if (!recipients.length) return;

        const message = buildActingManagerNotification({
            domain: ctx.domain,
            manager,
            reportEventType: ctx.reportEventType,
            reportEventName: ctx.reportEventName,
            isResult: ctx.isResult,
            planEventType: ctx.planEventType,
            planAt: ctx.planDeadline?.toRuHumanDateTime() ?? null,
            isExpired: ctx.isExpired,
            outcome: outcomeOf(ctx),
            card: cardOf(ctx),
        });
        const taskId = toId(ctx.currentTask?.id);
        const tag = `${NOTIFY_TAG_PREFIX}-${ctx.entityType}-${ctx.entityId}-${taskId}`;

        for (const userId of recipients) {
            try {
                await bitrix.imNotify.systemAdd({
                    USER_ID: userId,
                    MESSAGE: message,
                    TAG: tag,
                });
            } catch (error) {
                this.logger.warn(
                    `[${ctx.domain}] уведомление сотруднику ${userId} не ` +
                        `отправлено: ${(error as Error).message}`,
                );
            }
        }
    }

    /**
     * Кого уведомлять: сотрудника, от чьего имени ушёл отчёт, и владельца
     * закрытого дела, если следующий шаг назначили ДРУГОМУ подчинённому —
     * иначе прежний владелец не узнал бы, что дело отработано и передано.
     */
    private recipients(ctx: EventReportContext, managerId: number): number[] {
        const task = ctx.currentTask as unknown as Record<
            string,
            unknown
        > | null;
        const ids = [ctx.planResponsibleId, toId(task?.responsibleId)];
        return [...new Set(ids)].filter(id => id > 0 && id !== managerId);
    }
}

/** Имя руководителя из структуры отдела; '' — в структуре его нет. */
const nameFromStructure = (
    response: BxDepartmentStructureResponseDto,
    userId: number,
): string => {
    const pools: (readonly INamedUser[] | undefined)[] = [
        response.department?.allUsers,
        ...(response.salesDepartments ?? []).map(sales => sales.allUsers),
    ];
    for (const pool of pools) {
        const user = (pool ?? []).find(item => toId(item?.ID) === userId);
        if (!user) continue;
        const name = [user.LAST_NAME, user.NAME]
            .filter(Boolean)
            .join(' ')
            .trim();
        if (name) return name;
    }
    return '';
};

const outcomeOf = (ctx: EventReportContext): NotificationOutcome | null => {
    if (ctx.isSuccessSale) return 'success';
    if (!ctx.isFail) return null;
    return ctx.isNotCa ? 'notCa' : 'fail';
};

/** Карточка клиента для ссылки: компания → заявка → основная сделка. */
const cardOf = (ctx: EventReportContext): INotificationCard | null => {
    const candidates: [string, unknown, unknown, string][] = [
        ['company', ctx.company?.ID, ctx.company?.TITLE, 'Компания'],
        ['lead', ctx.lead?.ID, ctx.lead?.TITLE, 'Заявка'],
        [
            'deal',
            ctx.currentBaseDeal?.ID ?? ctx.ownerDeal?.ID,
            ctx.currentBaseDeal?.TITLE ?? ctx.ownerDeal?.TITLE,
            'Сделка',
        ],
    ];
    for (const [section, rawId, rawTitle, fallback] of candidates) {
        const id = toId(rawId);
        if (!id) continue;
        return {
            section,
            id,
            title: entityTitleOr(rawTitle, `${fallback} #${id}`),
        };
    }
    return null;
};
