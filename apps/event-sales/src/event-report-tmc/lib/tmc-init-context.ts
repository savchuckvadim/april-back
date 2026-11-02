import { IBXDeal } from '@/modules/bitrix';
import { IEventReportInitContext } from '../../event-report/services/init/event-report-init.types';

/**
 * ТМЦ-сделка отчёта: связь задачи (или `tmcDealId` из DTO) важнее, иначе —
 * открытая «ТМЦ Основная» компании у ответственного плана. Ровно порядок
 * легаси (`getFullTmcDealsFromPresTaks` → `getDealsFromNewTaskInnerTMC`).
 */
export const resolveTmcDeal = (init: IEventReportInitContext): IBXDeal | null =>
    init.currentTmcDeal ?? init.companyTmcDeal ?? null;

/**
 * Снимок init-фазы ДЛЯ ПОТОКА ТМЦ.
 *
 * В легаси-сервисе ТМЦ «основная сделка» (`currentBaseDeal`) — это ТМЦ-
 * сделка: от неё считается стадия, к ней привязывается задача, в неё пишут
 * историю, на неё ссылаются KPI и таймлайн. Общие flow-сервисы отчёта
 * (задачи, KPI, таймлайн, поля компании) читают `ctx.currentBaseDeal`, и
 * чтобы не плодить их ТМЦ-копии, контекст ТМЦ подменяет базу в снимке:
 * сделки отдела продаж (основная, ХО, презентации) для него не существуют
 * — ТМЦ их не двигает и не создаёт.
 */
export function toTmcInitContext(
    init: IEventReportInitContext,
    tmcDeal: IBXDeal | null,
): IEventReportInitContext {
    return {
        ...init,
        currentBaseDeal: tmcDeal,
        currentXoDeal: null,
        currentPresDeal: null,
        currentTmcDeal: tmcDeal,
        currentTmcFromPresentation: null,
        // Правила закрытой сделки запуска и перехвата — про «ОП Основную».
        reopenedBaseDeal: false,
        closedLaunchBaseDeal: null,
        foreignBaseDeal: null,
    };
}
