/**
 * Состав и расчёт КП на следующий год.
 *
 * Та же модель, что на фронте (front/apps/bitrix/app/(site)/renewal/model):
 * формулы обязаны совпадать, иначе в админке будет один итог, а у клиента
 * на странице другой. Поэтому расчёт здесь продублирован намеренно и
 * покрыт теми же проверками — страница считает сама из состава, а
 * сохранённый `monthlyTotal` нужен только для списка и отчётов.
 */

/** Прайс по умолчанию: от него считаются отличия у конкретного клиента. */
export const RENEWAL_PRICE_DEFAULTS = {
    sales: 5000,
    aiBase: 7500,
    aiBaseEmployees: 3,
    aiExtra: 1000,
    aiFreeDelta: 2,
    manager: 10000,
    devHour: 2000,
    devHours: 30,
} as const;

/** Границы значений: опечатка не должна превращать предложение в бессмыслицу. */
export const RENEWAL_LIMITS = {
    price: { min: 0, max: 1_000_000 },
    employees: { min: 1, max: 1000 },
    hours: { min: 0, max: 1000 },
    extras: { max: 10 },
} as const;

/** Периодичность дополнительной услуги. */
export const RENEWAL_EXTRA_PERIODS = ['month', 'once'] as const;

export type RenewalExtraPeriod = (typeof RENEWAL_EXTRA_PERIODS)[number];

/** Произвольная строка предложения — услуга вне прайса. */
export interface RenewalExtraLine {
    readonly title: string;
    readonly price: number;
    readonly period: RenewalExtraPeriod;
}

/** Полный состав предложения: что включено и почём. */
export interface RenewalOffer {
    readonly clientName: string;

    readonly salesIncluded: boolean;
    readonly salesPrice: number;

    readonly aiIncluded: boolean;
    readonly aiEmployees: number;
    readonly aiBasePrice: number;
    readonly aiBaseEmployees: number;
    readonly aiExtraPrice: number;
    readonly aiFreeDelta: number;

    readonly managerIncluded: boolean;
    readonly managerPrice: number;

    readonly devIncluded: boolean;
    readonly devHours: number;
    readonly devHourPrice: number;

    /** Со знаком: отрицательная — скидка. */
    readonly adjustment: number;
    readonly adjustmentLabel: string;

    readonly extras: readonly RenewalExtraLine[];
}

/** Цена AI-сервиса по числу сотрудников. */
export function calcAiPrice(offer: RenewalOffer): number {
    const extra = Math.max(
        0,
        Math.ceil(offer.aiEmployees) - offer.aiBaseEmployees,
    );
    return offer.aiBasePrice + extra * offer.aiExtraPrice;
}

/** Сумма месячных дополнительных услуг. */
export function calcExtrasMonthly(offer: RenewalOffer): number {
    return offer.extras
        .filter(line => line.period === 'month' && line.title.trim())
        .reduce((sum, line) => sum + line.price, 0);
}

/** Сумма разовых услуг — в месячный платёж не входит. */
export function calcExtrasOnce(offer: RenewalOffer): number {
    return offer.extras
        .filter(line => line.period === 'once' && line.title.trim())
        .reduce((sum, line) => sum + line.price, 0);
}

/** Месячный платёж по включённым услугам с учётом скидки. */
export function calcMonthlyTotal(offer: RenewalOffer): number {
    let total = 0;
    if (offer.salesIncluded) total += offer.salesPrice;
    if (offer.aiIncluded) total += calcAiPrice(offer);
    if (offer.managerIncluded) total += offer.managerPrice;
    total += calcExtrasMonthly(offer);
    total += offer.adjustment;
    // Скидка больше суммы не делает платёж отрицательным.
    return Math.max(0, total);
}

/** Коридор состава, в котором цена AI-сервиса не меняется. */
export function calcHeadcountRange(offer: RenewalOffer): {
    from: number;
    to: number;
} {
    const employees = Math.ceil(offer.aiEmployees);
    return {
        from: Math.max(1, employees - offer.aiFreeDelta),
        to: employees + offer.aiFreeDelta,
    };
}
