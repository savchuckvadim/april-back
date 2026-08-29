import type { ConstSmartKind } from '../const-smart-registry/const-smart-registry';

/**
 * РЕЕСТР ТИПОВ СОБЫТИЯ event-sales и их смартов — одна строка на тип.
 *
 * Зачем он здесь и почему один. Алфавит типов события сегодня переписан
 * руками в трёх местах: фронтовый union `EventTaskEventType`, список
 * `PLAN_CALL_TYPES` и два справочника условий каталога анкет
 * (`QUESTIONNAIRE_PLAN_TYPE_VALUES` / `QUESTIONNAIRE_REPORT_TYPE_VALUES`).
 * Списки уже разъехались в подписях — ровно так и теряется смысл: админка
 * называет тип одним словом, фрейм другим, а сверить их нечем.
 *
 * Второе (и главное) назначение — СВЯЗЬ «тип события → смарт». Ответ
 * портальной анкеты канала `smart` пишется не «в смарт вообще», а в тот
 * ЭЛЕМЕНТ, который создаёт или закрывает поток этого события: плановый,
 * закрываемый, перенесённый или спонтанный. Кто чей элемент — говорит эта
 * таблица и только она.
 *
 * Появился смарт на новый тип события — правится ОДНА строка (`smart:
 * null` → объект). Автоматически подтягиваются: гейт пикера в админке,
 * валидация сохранения анкеты, компиляция каталога, маршрутизация ответов
 * в джоб потока и выключатель анкет по типам события. Логика не трогается
 * нигде.
 *
 * Тип без смарта работает как сегодня: поля смарта в анкету этого типа
 * выбрать нельзя (сохранение откажет с внятным текстом), а поля компании,
 * сделки, лида и контакта — по-прежнему, каналами `crm`/`dto`/`text`.
 */

/**
 * Поток event-sales, который ведёт элемент смарта этого типа события.
 *
 * Значения совпадают с `QueueNames.EVENT_SALES_PRESENTATION_FLOW` и
 * `QueueNames.EVENT_SALES_ZPR_FLOW` по смыслу, но не по строке: реестр
 * лежит в portal-lib и про очереди приложения знать не обязан — джоб
 * маршрутизируется по этому коду в самом event-sales.
 */
export enum EnumEventSmartFlow {
    /** Сайд-очередь презентаций (presentation-flow). */
    presentation = 'presentation',
    /** Сайд-очередь звонков по решению (zpr-flow). */
    zpr = 'zpr',
}

/** Смарт, элемент которого ведёт поток этого типа события. */
export interface EventTypeSmartBinding {
    /** `kind` из CONST_SMART_REGISTRY. */
    kind: ConstSmartKind;
    /**
     * `smarts.type` / `smarts.group` — чем строка смарта опознаётся в БД.
     * Коды типа события и смарта СОЗНАТЕЛЬНО разные (тип `presentation` ↔
     * смарт `type: 'pres'`: имя `presentation` занято Excel-шаблоном
     * SmartNameEnum). Связь описана явной строкой, а не совпадением строк.
     */
    type: string;
    group: string;
    /** Очередь, чей джоб знает id элемента. */
    flow: EnumEventSmartFlow;
}

/** Тип события: код, подпись, планируемость и смарт (если он есть). */
export interface EventTypeDescriptor {
    /**
     * Код ОТЧЁТНОГО типа: алфавит фронтового `EventTaskEventType`, он
     * рождается разбором заголовка задачи (`parseTaskTitle`).
     */
    code: string;
    /** Подпись для админки. */
    name: string;
    /** Тип предлагается менеджеру при планировании (зеркало PLAN_CALL_TYPES). */
    isPlannable: boolean;
    /** Смарт этого типа; null — смарта пока нет, всё работает как сегодня. */
    smart: EventTypeSmartBinding | null;
}

/**
 * Типы события по порядку показа. Порядок несущий: из него выводятся оба
 * справочника условий каталога анкет и список выключателя в настройках.
 */
export const EVENT_TYPE_REGISTRY = [
    {
        code: 'xo',
        name: 'Холодный обзвон',
        // Холодную работу менеджер не планирует: задачу ставит робот, а в
        // алфавите плана её роль играет недостижимый из UI код `cold`.
        isPlannable: false,
        smart: null,
    },
    {
        code: 'xoRequest',
        name: 'Холодный обзвон: заявка',
        isPlannable: false,
        smart: null,
    },
    {
        code: 'xoLead',
        name: 'Холодный обзвон: лид',
        isPlannable: false,
        smart: null,
    },
    { code: 'warm', name: 'Звонок', isPlannable: true, smart: null },
    {
        code: 'presentation',
        name: 'Презентация',
        isPlannable: true,
        smart: {
            kind: 'presentation',
            type: 'pres',
            group: 'sales',
            flow: EnumEventSmartFlow.presentation,
        },
    },
    { code: 'refine', name: 'Доработка', isPlannable: true, smart: null },
    {
        code: 'hot',
        name: 'Решение',
        isPlannable: true,
        smart: {
            kind: 'zpr',
            type: 'zpr',
            group: 'sales',
            flow: EnumEventSmartFlow.zpr,
        },
    },
    { code: 'moneyAwait', name: 'Оплата', isPlannable: true, smart: null },
    { code: 'supply', name: 'Поставка', isPlannable: true, smart: null },
    {
        code: 'ss',
        // Фрейм зовёт этот тип «Сервисный сигнал» (EV_TYPE.SS), админка —
        // «Сопровождение»: подпись историческая, менять её здесь значит
        // переименовать условие в уже заведённых анкетах.
        name: 'Сопровождение',
        isPlannable: false,
        smart: null,
    },
] as const satisfies readonly EventTypeDescriptor[];

/** Код типа события из реестра. */
export type EventTypeCode = (typeof EVENT_TYPE_REGISTRY)[number]['code'];

/** Описатель типа по коду; неизвестный код — undefined. */
export const findEventType = (code: string): EventTypeDescriptor | undefined =>
    EVENT_TYPE_REGISTRY.find(descriptor => descriptor.code === code);

/**
 * Типы события, ответы по которым уходят в элемент ЭТОГО смарта.
 * `'presentation'` → `['presentation']`. Пусто — смарт к типам события не
 * привязан, писать в него ответы анкеты некуда.
 */
export const findEventTypesBySmartKind = (kind: string): string[] =>
    EVENT_TYPE_REGISTRY.filter(
        descriptor => descriptor.smart?.kind === kind,
    ).map(descriptor => descriptor.code);

/**
 * Смарт, элемент которого ведёт ЭТОТ поток: `presentation` → `'presentation'`.
 *
 * Нужен сайд-очередям: джоб знает, какая он очередь, и по этой строке
 * отбирает «свои» ответы анкеты из общего конверта отчёта. Читать реестр,
 * а не писать строку `'presentation'` руками, — то же правило, что и
 * везде: связь «тип события ↔ смарт ↔ поток» живёт в одном месте.
 */
export const findSmartKindByFlow = (
    flow: EnumEventSmartFlow,
): string | undefined =>
    EVENT_TYPE_REGISTRY.find(descriptor => descriptor.smart?.flow === flow)
        ?.smart?.kind;

/**
 * Привязка по строке `smarts` портала: (type, group) → смарт типа события.
 * undefined — у смарта нет потока, который создавал бы элемент.
 */
export const findSmartBindingByTypeGroup = (
    type: string,
    group: string,
): EventTypeSmartBinding | undefined =>
    EVENT_TYPE_REGISTRY.find(
        descriptor =>
            descriptor.smart?.type === type &&
            descriptor.smart?.group === group,
    )?.smart ?? undefined;

/** Типы события со смартом — тип, ради которого реестр и заведён. */
export const EVENT_TYPES_WITH_SMART: readonly EventTypeDescriptor[] =
    EVENT_TYPE_REGISTRY.filter(descriptor => descriptor.smart !== null);
