import { Injectable } from '@nestjs/common';
import {
    IDealWithRows,
    OrkActsUpdateUseCase,
} from './ork-acts-update.use-case';
import {
    IActSmartItemResult,
    ISmartActItemsByDealResult,
} from '../services/smart/smart-act-gsr.service';
import {
    buildContractActPeriods,
    IContractActPeriodSlot,
} from '../services/ork-deals/utils/build-contract-act-periods.util';
import { tryBuildLicenseCalendarOneMonthShift } from '../services/ork-deals/utils/deal-license-calendar-one-month-shift.util';

type TReconcileActionType =
    | 'notify_responsible_missing_data'
    | 'skip_contract_not_started'
    | 'align_contract_start_one_month_license'
    | 'remove_failed_acts'
    | 'create_new_act'
    | 'close_inprogress_act'
    | 'remove_extra_acts'
    | 'increase_deal_products'
    | 'decrease_deal_products'
    | 'nothing_to_do';

export interface IReconcileActionPlanItem {
    type: TReconcileActionType;
    reason: string;
    // Технический комментарий: здесь описываем, какой API-вызов будет позже.
    todoComment: string;
    /** Для align_contract_start_one_month_license — новое значение UF «дата начала» (ISO). */
    shiftedContractStartIso?: string;
}

export interface IDealReconcilePlan {
    dealId: number;
    item: IDealWithRows;
    assignedById: string | null;
    actions: IReconcileActionPlanItem[];

    actsSummury: {
        expectedTotal: number;
        expectedClosed: number;
        expectedInprogress: number;
        actualTotal: number;
        actualClosed: number;
        actualInprogress: number;
        actualFailed: number;
    };
    monthPeriodSummary: {
        total: number;
        passed: number;
        remaining: number;
        current: number;
    };
    productsSummary: {
        total: number;
        actual: number;
        expected: number;
    };
    /** Календарные слоты по месяцам договора для выставления from/to у актов */
    expectedActPeriods: IContractActPeriodSlot[];
}

@Injectable()
export class OrkActsReconcilePlanUseCase {
    constructor(private readonly orkActsUpdateUseCase: OrkActsUpdateUseCase) {}

    async execute(dealId?: number): Promise<{ plans: IDealReconcilePlan[] }> {
        console.log('OrkActsReconcilePlanUseCase execute');
        const { dealsWithRows } =
            await this.orkActsUpdateUseCase.execute(dealId);
        const plans = dealsWithRows.map(item => {
            const result = this.buildDealPlan(item);
            console.log('OrkActsReconcilePlanUseCase result', result);
            return result;
        });
        return { plans };
    }

    private buildDealPlan(item: IDealWithRows): IDealReconcilePlan {
        const dealId = Number(item.deal.deal.ID);
        const assignedById = item.deal.deal.ASSIGNED_BY_ID ?? null;
        const { periodData } = item.deal;

        const totalMonths = Math.max(periodData.totalMonths, 0); //всего месяцев по договору
        const passedMonths = Math.max(periodData.passedMonths, 0); //прошло месяцев
        const currentMonth = Math.max(periodData.currentMonth, 0); //текущий месяц
        const remainingMonths = Math.max(periodData.remainingMonths, 0); //осталось месяцев

        const expectedActsTotal = Math.min(currentMonth, totalMonths); //ожидаемые акты
        const expectedClosedActs = Math.min(passedMonths, totalMonths); //ожидаемые закрытые акты
        const expectedInprogressActs = Math.min(remainingMonths, totalMonths); //ожидаемые в процессе акты
        const expectedProductsTotal = totalMonths;

        const actualProductsTotal = this.getProductsTotal(item); //фактическое количество товаров
        const actualClosedActs = this.getClosedActQuantity(item.smartItems); //фактическое количество закрытых актов
        const actualInprogressActs = this.getInprogressActQuantity(
            item.smartItems,
        ); //фактическое количество в процессе актов
        const actualFailedActs = this.getFailedActQuantity(item.smartItems); //фактическое количество не закрытых актов
        const actualActCount = this.getActsQuntity(item.smartItems.items); //фактическое количество актов
        const hasMissingPeriod =
            !periodData.isFromNotEmpty || !periodData.isToNotEmpty;
        const hasMissingProducts = item.rows.length === 0;

        const actions: IReconcileActionPlanItem[] = [];
        const actsSummury = {
            expectedTotal: expectedActsTotal,
            expectedClosed: expectedClosedActs,
            expectedInprogress: expectedInprogressActs,
            actualTotal: actualActCount,
            actualClosed: actualClosedActs,
            actualInprogress: actualInprogressActs,
            actualFailed: actualFailedActs,
        };

        const monthPeriodSummary = {
            total: totalMonths, //общее количество месяцев
            passed: passedMonths, //прошло месяцев
            remaining: remainingMonths, //осталось месяцев
            current: currentMonth, //текущий месяц
        };
        const productsSummary = {
            total: expectedProductsTotal, //ожидаемое общее количество товаров
            actual: actualProductsTotal, //фактическое общее количество товаров
            expected: expectedProductsTotal, //ожидаемое общее количество товаров
        };

        const expectedActPeriods =
            !hasMissingPeriod && totalMonths > 0
                ? buildContractActPeriods(
                      periodData.from,
                      periodData.to,
                      totalMonths,
                  )
                : [];

        console.log('actsSummury', actsSummury);
        if (hasMissingPeriod || hasMissingProducts) {
            actions.push({
                type: 'notify_responsible_missing_data',
                reason: 'Недостаточно данных для синхронизации договора и актов',
                todoComment:
                    'Создать todo ответственному: заполнить даты договора и/или товары в сделке.',
            });
            return {
                dealId,
                item,
                assignedById,
                actions,
                actsSummury,
                monthPeriodSummary,
                productsSummary,
                expectedActPeriods,
            };
        }

        if (currentMonth <= 0) {
            actions.push({
                type: 'skip_contract_not_started',
                reason: 'Договор еще не начался (текущий месяц <= 0)',
                todoComment:
                    'Ничего не делать до наступления периода начала договора.',
            });
            return {
                dealId,
                item,
                assignedById,
                actions,
                actsSummury,
                monthPeriodSummary,
                productsSummary,
                expectedActPeriods,
            };
        }

        const licenseOneMonthShift = tryBuildLicenseCalendarOneMonthShift({
            calendarTotalMonths: totalMonths,
            contractFromIso: periodData.from,
            productQuantity: item.productQuantity,
            productCoefficient: item.productCoefficient,
        });
        if (licenseOneMonthShift != null) {
            actions.push({
                type: 'align_contract_start_one_month_license',
                reason: `Календарь договора ${licenseOneMonthShift.calendarTotalMonths} мес., лицензия qty×коэф = ${licenseOneMonthShift.licensedMonths} мес. (ровно +1 мес.): сдвинуть дату «с» на месяц вперёд в CRM.`,
                todoComment:
                    'crm.deal.update: UF даты начала договора = shiftedContractStartIso; затем пересчитать период и акты.',
                shiftedContractStartIso:
                    licenseOneMonthShift.shiftedStartFromIso,
            });
        }

        if (actualFailedActs > 0) {
            actions.push({
                type: 'remove_failed_acts',
                reason: `Найдены акты в стадии fail: ${actualFailedActs}`,
                todoComment:
                    'Удалить смарт-акты в стадии "не состоялся", чтобы они не искажали расчет.',
            });
        }

        if (actualActCount < expectedActsTotal) {
            actions.push({
                type: 'create_new_act',
                reason: `Актов меньше нормы: ${actualActCount}/${expectedActsTotal}`,
                todoComment:
                    'Создать недостающие акты (по 1 за месяц) и поставить quantity=1 для каждого.',
            });
        } else if (actualActCount > expectedActsTotal) {
            actions.push({
                type: 'remove_extra_acts',
                reason: `Актов больше нормы: ${actualActCount}/${expectedActsTotal}`,
                todoComment:
                    'Удалить лишние акты (кейс отказа/сокращения периода задним числом).',
            });
        }

        if (expectedClosedActs > 0) {
            actions.push({
                type: 'close_inprogress_act',
                reason: `Должно быть закрыто к текущему моменту: ${expectedClosedActs}`,
                todoComment:
                    'Закрыть акты за прошедшие месяцы в success-стадию, при необходимости создать следующий.',
            });
        }

        /**
         * Потолок для увеличения qty: не больше месяцев договора.
         * Если success-актов меньше, чем по календарю должно быть закрыто — ориентируемся на expectedClosed
         * (иначе при 0 актов actualClosed=0 и инкремент никогда не попадёт в план).
         * Когда акты догнали план — снова только min(месяцев, сумма qty по success), не опережать оплату.
         */
        const increaseDealProductsCeiling =
            actualClosedActs < expectedClosedActs
                ? Math.min(expectedProductsTotal, expectedClosedActs)
                : Math.min(expectedProductsTotal, actualClosedActs);
        if (actualProductsTotal < increaseDealProductsCeiling) {
            actions.push({
                type: 'increase_deal_products',
                reason: `Товаров меньше нормы (потолок ${increaseDealProductsCeiling} из ${expectedProductsTotal} мес. договора): ${actualProductsTotal}/${increaseDealProductsCeiling}`,
                todoComment:
                    'Поднять quantity в строках сделки до потолка (догонка по закрытым актам или по плану закрытых, если актов ещё нет).',
            });
        } else if (actualProductsTotal > expectedProductsTotal) {
            actions.push({
                type: 'decrease_deal_products',
                reason: `Товаров больше нормы по договору (qty×коэф vs месяцев): ${actualProductsTotal}/${expectedProductsTotal}`,
                todoComment:
                    'Сократить quantity в строках сделки под ожидаемые месяцы договора (в т.ч. после укорочения или лишнего qty).',
            });
        }

        if (actions.length === 0) {
            actions.push({
                type: 'nothing_to_do',
                reason: 'Сделка и акты синхронизированы',
                todoComment: 'Ничего не менять.',
            });
        }

        return {
            dealId,
            item,
            assignedById,
            actions,
            actsSummury,
            monthPeriodSummary,
            productsSummary,
            expectedActPeriods,
        };
    }

    private getProductsTotal(item: IDealWithRows): number {
        const coefficient = Math.max(item.productCoefficient || 1, 1);
        const quantity = Math.max(item.productQuantity || 0, 0);
        return quantity * coefficient;
    }
    private getClosedActQuantity(
        smartItems: ISmartActItemsByDealResult,
    ): number {
        const closed = smartItems.items.filter(
            item => item.stageType === 'success',
        );
        return this.getActsQuntity(closed);
    }
    private getInprogressActQuantity(
        smartItems: ISmartActItemsByDealResult,
    ): number {
        const inprogress = smartItems.items.filter(
            item => item.stageType === 'inprogress' || item.stageType === 'new',
        );
        return this.getActsQuntity(inprogress);
    }
    private getFailedActQuantity(
        smartItems: ISmartActItemsByDealResult,
    ): number {
        const failed = smartItems.items.filter(
            item => item.stageType === 'fail',
        );
        return this.getActsQuntity(failed);
    }
    private getActsQuntity(items: IActSmartItemResult[]): number {
        const totalQuantities = items.map(item => item.quantity ?? 0);
        const totalQuantity = totalQuantities.reduce(
            (acc, curr) => acc + curr,
            0,
        );
        return totalQuantity;
    }
}
