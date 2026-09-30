/**
 * Русские формы слов при числах для текстов витрины и push-уведомлений:
 * «1 разбор», «2 разбора», «5 разборов». По правилу владельца тексты,
 * которые читает руководитель или менеджер, пишутся словами — без
 * «n = 18», кодов и формул, поэтому склонение живёт здесь, а не в каждом
 * шаблоне заново.
 *
 * Чистые функции: без DI, времени и случайности.
 */
import type { CallReportCallTypeCode } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';

/** Три формы слова: для 1, для 2–4 и для 5–20 (а также нуля и 11–14). */
export type RuPluralForms = readonly [one: string, few: string, many: string];

/**
 * Форма слова по числу. Дробное число берёт форму «2–4» (родительный
 * единственного: «1,5 продажи»), как и принято в русском.
 */
export function ruPluralForm(count: number, forms: RuPluralForms): string {
    const abs = Math.abs(count);
    if (!Number.isFinite(abs)) return forms[2];
    if (!Number.isInteger(abs)) return forms[1];
    const mod100 = abs % 100;
    const mod10 = abs % 10;
    if (mod100 >= 11 && mod100 <= 14) return forms[2];
    if (mod10 === 1) return forms[0];
    if (mod10 >= 2 && mod10 <= 4) return forms[1];

    return forms[2];
}

/** Целое для текста: округление до целого, «−0» → 0. */
export function ruInt(value: number): number {
    const rounded = Math.round(value);

    return rounded === 0 ? 0 : rounded;
}

/** Число с фиксированным числом знаков и запятой: 6.4 → «6,4». */
export function ruDecimal(value: number, digits = 1): string {
    return value.toFixed(digits).replace('.', ',');
}

/** «12 звонков»: число и форма слова через пробел. */
export function ruCount(count: number, forms: RuPluralForms): string {
    const text = Number.isInteger(count) ? String(count) : ruDecimal(count);

    return `${text} ${ruPluralForm(count, forms)}`;
}

/**
 * Количество для текста: целое, если после округления не ноль; малую
 * дробь (0 < |x| < 0,5) оставляем с одним знаком, чтобы «0 звонков» не
 * скрывал ненулевую величину.
 */
export function ruAmount(value: number, forms: RuPluralForms): string {
    const rounded = ruInt(value);

    return rounded === 0 && value !== 0
        ? ruCount(Number(ruDecimal(value).replace(',', '.')), forms)
        : ruCount(rounded, forms);
}

/** Частые формы слов витрины (именительный падеж при числе). */
export const RU_FORMS = {
    calls: ['звонок', 'звонка', 'звонков'],
    /** «в 9 звонках» — предложный падеж. */
    callsPrepositional: ['звонке', 'звонках', 'звонках'],
    reviews: ['разбор', 'разбора', 'разборов'],
    /** «по 18 разборам» — дательный падеж. */
    reviewsDative: ['разбору', 'разборам', 'разборам'],
    /** «из 20 разборов» — родительный падеж. */
    reviewsGenitive: ['разбора', 'разборов', 'разборов'],
    sales: ['продажа', 'продажи', 'продаж'],
    /** «около 1 продажи», «около 5 продаж» — родительный падеж. */
    salesGenitive: ['продажи', 'продаж', 'продаж'],
    /** «добрать 1 продажу», «добрать 3 продажи» — винительный падеж. */
    salesAccusative: ['продажу', 'продажи', 'продаж'],
    deals: ['сделка', 'сделки', 'сделок'],
    presentations: ['презентация', 'презентации', 'презентаций'],
    objections: ['возражение', 'возражения', 'возражений'],
    months: ['месяц', 'месяца', 'месяцев'],
    workdays: ['рабочий день', 'рабочих дня', 'рабочих дней'],
    /** «в сравнении с 8 коллегами» — творительный падеж. */
    colleaguesInstrumental: ['коллегой', 'коллегами', 'коллегами'],
    times: ['раз', 'раза', 'раз'],
    /** «на 7 пунктов» — разность долей в процентных пунктах. */
    points: ['пункт', 'пункта', 'пунктов'],
} as const satisfies Record<string, RuPluralForms>;

/** Активность по типу звонка словами: «12 холодных звонков». */
export const CALL_TYPE_COUNT_FORMS: Partial<
    Record<CallReportCallTypeCode, RuPluralForms>
> = {
    cold: ['холодный звонок', 'холодных звонка', 'холодных звонков'],
    site_lead: ['заявка с сайта', 'заявки с сайта', 'заявок с сайта'],
    call: RU_FORMS.calls,
    presentation: RU_FORMS.presentations,
    refine: ['доработка', 'доработки', 'доработок'],
    decision: ['звонок по решению', 'звонка по решению', 'звонков по решению'],
    payment: ['звонок по оплате', 'звонка по оплате', 'звонков по оплате'],
};

const ACTIVITY_FALLBACK_FORMS: RuPluralForms = [
    'активность',
    'активности',
    'активностей',
];

/** Формы слова для активности типа звонка; чужой код — «активность». */
export function callTypeCountForms(callType: string): RuPluralForms {
    const forms = (
        CALL_TYPE_COUNT_FORMS as Partial<Record<string, RuPluralForms>>
    )[callType];

    return forms ?? ACTIVITY_FALLBACK_FORMS;
}
