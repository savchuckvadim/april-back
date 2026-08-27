import { EventReportEventType } from '../../../types/event-report.event-codes';

/**
 * Значение, которое политика предписывает записать в поле сущности.
 * `null` — ОБНУЛИТЬ поле (осмысленная команда, а не «нечего писать»).
 */
export type PolicyFieldValue = string | number | null;

/**
 * «Поле не трогаем» — принципиально другое, чем `null`.
 *
 * Разница не косметическая: `null` уезжает в Bitrix и стирает значение, а
 * `POLICY_KEEP` означает «этот отчёт про это поле ничего не знает, оставь
 * что было». Раньше обе ситуации выражались одинаково (просто не вызывали
 * `setScalar`), и «оставить как было» нельзя было отличить от «обнулить» —
 * из-за чего обнуление приходилось писать вручную в другом месте кода.
 */
export const POLICY_KEEP = undefined;
export type PolicyOutcome = PolicyFieldValue | typeof POLICY_KEEP;

/**
 * Событие клиента на оси времени: либо уже существующее ОТКРЫТОЕ дело
 * (задача обзвона), либо то, которое ставит ЭТОТ отчёт.
 *
 * Даты держим в двух видах намеренно: `at` — абсолютный момент, по нему
 * события сравниваются между собой; `crmDateTime` — уже готовая строка в
 * локали портала, именно она уезжает в datetime-поле CRM. Пересчитывать
 * формат внутри стратегий нельзя: стратегии обязаны остаться чистыми и
 * ничего не знать ни о таймзоне портала, ни о формате полей Bitrix.
 */
export interface ClientEvent {
    /** id задачи Bitrix; `null` — событие, которое ставит этот отчёт. */
    readonly taskId: number | null;
    readonly eventType: EventReportEventType;
    /** Название события (тема) — для `call_next_name`. */
    readonly name: string;
    /** Абсолютный момент дедлайна (epoch ms) — только для сравнения. */
    readonly at: number;
    /** Дедлайн в формате CRM datetime-поля (`DD.MM.YYYY HH:mm:ss`). */
    readonly crmDateTime: string;
    /** Ответственный за событие; `null` — неизвестен. */
    readonly responsibleId: number | null;
}

/**
 * Как поле получает значение. Разные поля считаются по-разному — здесь это
 * выражено явно, а не спрятано в ветках `if` по месту записи.
 */
export type FieldValueSource =
    /**
     * Дата ближайшего открытого дела клиента (с фильтром по типу события).
     * Это и есть «умная» альтернатива слепой записи плана: у клиента может
     * быть несколько открытых дел, и следующим будет РАННЕЕ из них, а не то,
     * которое только что запланировали.
     */
    | {
          readonly kind: 'nearestEventDate';
          /** Типы событий, которые считаются; пусто — любые. */
          readonly eventTypes?: readonly EventReportEventType[];
      }
    /** Название того же ближайшего дела (пара к `nearestEventDate`). */
    | {
          readonly kind: 'nearestEventName';
          readonly eventTypes?: readonly EventReportEventType[];
      }
    /**
     * Слепая запись готового значения. НЕ костыль: для «даты последнего
     * звонка» перезапись — единственно верная семантика, поле по смыслу
     * и есть «последний».
     */
    | { readonly kind: 'overwrite' }
    /** Текущее значение + шаг (счётчики: презентации, переносы). */
    | { readonly kind: 'increment'; readonly step: number };

/** Правила обнуления поля. Проверяются ДО вычисления значения. */
export const EFieldResetRule = {
    /**
     * Финал работы с клиентом: продажа, отказ, «не ЦА». Ось следующего
     * события после финала врёт по определению — работы больше нет.
     */
    final: 'final',
    /**
     * Открытых дел нужного типа не осталось. Это и есть «обнуление по уходу
     * со стадии»: клиент ушёл с презентационной части воронки ровно тогда,
     * когда у него не осталось ни одной открытой презентации.
     */
    noOpenEvent: 'noOpenEvent',
} as const;

export type FieldResetRule =
    (typeof EFieldResetRule)[keyof typeof EFieldResetRule];

/**
 * ОДНО описание на поле: как значение получается и когда обнуляется.
 * Больше про поле знать нечего — вся остальная логика общая.
 */
export interface FieldPolicy {
    /** Код поля в реестре pbx (`portal.getEntityFieldByCode`). */
    readonly code: string;
    /** Почему поле считается так — читается вместе с таблицей политик. */
    readonly why: string;
    readonly source: FieldValueSource;
    readonly resetOn: readonly FieldResetRule[];
}

/** Состояние прогона, на котором резолвятся политики. */
export interface FieldPolicyInput {
    /**
     * Ось событий клиента ПОСЛЕ применения этого отчёта: открытые дела без
     * закрываемой задачи + то, которое отчёт планирует.
     */
    readonly events: readonly ClientEvent[];
    /** Финал работы (продажа/отказ/«не ЦА») — включает правило `final`. */
    readonly isFinal: boolean;
    /** Готовое значение для `overwrite`. */
    readonly value?: PolicyFieldValue;
    /** Текущее значение поля — для `increment`. */
    readonly current?: number;
}

/**
 * Настройки портала, управляющие КЛАССАМИ поведения полей.
 *
 * Настройка на каждое поле — тупик: полей десятки, а решений владельца
 * два. Поэтому здесь ровно два переключателя, и каждый управляет группой
 * полей с одинаковой семантикой.
 */
export interface EventFieldPolicySettings {
    /**
     * Ось следующего события считается по открытым делам клиента, а не
     * пишется планом вслепую (`call_next_date`, `call_next_name`,
     * `next_pres_plan_date`). Выключено — прежнее поведение.
     */
    readonly calculatedNextEvent: boolean;
    /**
     * Финал (продажа/отказ/«не ЦА») обнуляет ось следующего события.
     */
    readonly resetOnFinal: boolean;
}

/**
 * Дефолт для прогонов, где настройки не резолвили (тесты, легаси-вызовы).
 * Совпадает с дефолтами схемы портала — одно место правды на два входа.
 */
export const DEFAULT_FIELD_POLICY_SETTINGS: EventFieldPolicySettings = {
    calculatedNextEvent: true,
    resetOnFinal: true,
};
