import { Logger } from '@nestjs/common';
import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { EBXTaskStatus } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EventReportContext } from '../context/event-report.context';
import { positiveId } from '../deal/deal-notice.util';

/** Через сколько ТМЦ-менеджер должен снова позвонить (легаси: сутки). */
const RETURN_CALL_AFTER_HOURS = 24;
/** Название задачи ТМЦ-менеджера после возврата (легаси, дословно). */
const RETURNED_TASK_TITLE = 'Звонок: вернули из ОП';
/** Задача, которую ищем у ТМЦ-менеджера, — его задача на презентацию. */
const TMC_TASK_TITLE_PART = 'Презентация';

/**
 * Возврат презентации в ТМЦ — порт легаси `EventReportReturnToTmcService.php`.
 *
 * Менеджер ОП вернул клиента ТМЦ-менеджеру (кнопка «в ТМ»). Отчёт при этом
 * идёт обычным отказом по сделкам ОП (deal-flow), ТМЦ-сделка в батче не
 * трогается (TmcDealService), а ЗДЕСЬ — после основного батча, прямыми
 * вызовами, как в легаси:
 *  1. у ТМЦ-менеджера (ответственный ТМЦ-сделки) ищется открытая задача
 *     «Презентация» по этой компании и ТМЦ-сделке в группе задач обзвона —
 *     ей ставится срок «сутки от сейчас» и название «Звонок: вернули из ОП»;
 *  2. компания переназначается на ТМЦ-менеджера.
 * Стадию ТМЦ-сделки легаси не меняло — и мы не меняем (владелец, 02.11.2026).
 *
 * ТМЦ-сделка берётся из payload (`returnToTmc.data.tmcDeal` — фронт нашёл её
 * через /pres/tmc-deals), иначе из контекста (привязки задачи или обратная
 * ссылка презентации). Ошибки гасятся: отчёт уже состоялся.
 *
 * Не @Injectable: инстанс Битрикса домена приходит в конструктор.
 */
export class EventReportReturnToTmcService {
    private readonly logger = new Logger(EventReportReturnToTmcService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    async apply(ctx: EventReportContext): Promise<void> {
        if (!ctx.isNeedReturnToTmc) return;
        const tmcDeal = this.resolveTmcDeal(ctx);
        const tmcDealId = positiveId(tmcDeal?.ID);
        const tmcManagerId = positiveId(tmcDeal?.ASSIGNED_BY_ID);
        if (!tmcDeal || !tmcDealId || !tmcManagerId) {
            this.logger.warn(
                `return-to-tmc: ${ctx.domain} — ТМЦ-сделка или её ответственный не определены, возврат не выполнен`,
            );
            return;
        }
        const companyId =
            positiveId(tmcDeal.COMPANY_ID) ?? positiveId(ctx.company?.ID);

        await this.rescheduleTmcTask(ctx, tmcDealId, tmcManagerId, companyId);
        await this.handOverCompany(ctx, companyId, tmcManagerId);
    }

    /** Из payload (как легаси) либо из контекста отчёта. */
    private resolveTmcDeal(ctx: EventReportContext): IBXDeal | null {
        // Легаси-фронт мог прислать вместо объекта false/0/null.
        const data = ctx.dto.returnToTmc?.data;
        const fromPayload =
            data && typeof data === 'object' ? (data.tmcDeal ?? null) : null;
        return (
            fromPayload ?? ctx.currentTmcDeal ?? ctx.currentTmcFromPresentation
        );
    }

    /** Задача ТМЦ-менеджера на презентацию → «Звонок: вернули из ОП», срок +24 ч. */
    private async rescheduleTmcTask(
        ctx: EventReportContext,
        tmcDealId: number,
        tmcManagerId: number,
        companyId: number | null,
    ): Promise<void> {
        const crmLinks = [
            companyId ? `CO_${companyId}` : null,
            `D_${tmcDealId}`,
        ].filter((link): link is string => link !== null);
        try {
            const response = (await this.bitrix.task.getList(
                {
                    '%TITLE': TMC_TASK_TITLE_PART,
                    GROUP_ID: this.portal.getSalesTaskGroupId(),
                    UF_CRM_TASK: crmLinks,
                    RESPONSIBLE_ID: tmcManagerId,
                    '!=STATUS': EBXTaskStatus.COMPLETED,
                },
                ['ID', 'TITLE'],
            )) as { result?: { tasks?: { id?: number | string }[] } };
            const taskId = positiveId(response?.result?.tasks?.[0]?.id);
            if (!taskId) {
                this.logger.log(
                    `return-to-tmc: ${ctx.domain} — открытой задачи «Презентация» у ТМЦ-менеджера #${tmcManagerId} по сделке #${tmcDealId} нет`,
                );
                return;
            }
            const deadline = ctx.dateTime.taskDeadline(
                new Date(Date.now() + RETURN_CALL_AFTER_HOURS * 60 * 60 * 1000),
            );
            await this.bitrix.task.update(taskId, {
                DEADLINE: deadline,
                ALLOW_CHANGE_DEADLINE: 'Y',
                TITLE: RETURNED_TASK_TITLE,
            });
            this.logger.log(
                `return-to-tmc: ${ctx.domain} задача #${taskId} → «${RETURNED_TASK_TITLE}», срок ${deadline}`,
            );
        } catch (error) {
            this.logger.warn(
                `return-to-tmc: ${ctx.domain} — задача ТМЦ-менеджера не обновлена: ${(error as Error).message}`,
            );
        }
    }

    /** Компания — ТМЦ-менеджеру. */
    private async handOverCompany(
        ctx: EventReportContext,
        companyId: number | null,
        tmcManagerId: number,
    ): Promise<void> {
        if (!companyId) return;
        try {
            await this.bitrix.company.update(companyId, {
                ASSIGNED_BY_ID: String(tmcManagerId),
            });
            this.logger.log(
                `return-to-tmc: ${ctx.domain} компания #${companyId} → ответственный #${tmcManagerId}`,
            );
        } catch (error) {
            this.logger.warn(
                `return-to-tmc: ${ctx.domain} — компания #${companyId} не переназначена: ${(error as Error).message}`,
            );
        }
    }
}
