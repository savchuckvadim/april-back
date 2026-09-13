import { PortalDealServiceStageCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';

/**
 * Сколько дней осталось до конца договора. null — даты нет или она нечитаема
 * (в RPA поле необязательно заполнено корректно).
 */
export const daysUntilContractEnd = (
    contractEnd: string | null | undefined,
    now: Date = new Date(),
): number | null => {
    if (!contractEnd) {
        return null;
    }

    const end = new Date(contractEnd);
    if (Number.isNaN(end.getTime())) {
        return null;
    }

    return Math.ceil((end.getTime() - now.getTime()) / (1000 * 3600 * 24));
};

/**
 * Стадия сервисной сделки по остатку срока договора — та же лестница, что у
 * перекладки сделок в event-service (deals-move/move-deal-stages).
 * Даты нет — ставим «в работе»: это нейтральный вход в воронку.
 */
export const resolveServiceStageCode = (
    days: number | null,
): PortalDealServiceStageCodeEnum => {
    if (days === null) {
        return PortalDealServiceStageCodeEnum.in_work;
    }
    if (days < 14) {
        return PortalDealServiceStageCodeEnum.reg_two_weeks;
    }
    if (days < 30) {
        return PortalDealServiceStageCodeEnum.reg_one;
    }
    if (days < 91) {
        return PortalDealServiceStageCodeEnum.reg_three;
    }
    if (days < 182) {
        return PortalDealServiceStageCodeEnum.reg_six;
    }
    return PortalDealServiceStageCodeEnum.in_work;
};
