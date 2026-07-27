/**
 * Каталог плановых показателей — ЕДИНСТВЕННОЕ место, где перечислено,
 * ЧТО можно планировать и откуда берётся ФАКТ. Коды прижаты к истинной
 * типизации user-полей (PBX_SALES_USER_PLAN_FIELD_CODES), kpi-ключи —
 * к FilterInnerCode, звонковые бакеты — к CallingDuration. Ноль магии.
 *
 * НЕ путать с kpi-«планами» (call_plan и т.п. — CRM-задачи менеджера):
 * здесь целевые значения руководителя (targets).
 */
import {
    findPbxSalesUserPlanField,
    PBX_SALES_USER_PLAN_FIELD_CODES,
    PbxSalesUserPlanFieldCode,
} from '@lib/portal-lib/pbx-domain/field/type/sales/user/pbx-sales-user-plan-field.type';
import { createEnumObject } from '@lib/portal-lib/pbx-domain/field/type/pbx-field-type.util';
import { USER_FIELD_PREFIX } from '@lib/pbx-user-fields';
import { FilterInnerCode } from '../../shared/dto/kpi.dto';
import { CallingDuration } from '../../report/types/calling-statistic.type';
import { ClosedSalesTotalsDto } from '../../sales-finance/dto/closed-sales-response.dto';

/** Единица измерения планового показателя (форматирование на фронте). */
export const PLAN_UNITS = ['count', 'money', 'minutes'] as const;
export type PlanUnit = (typeof PLAN_UNITS)[number];
export const PLAN_UNIT = Object.freeze(createEnumObject(PLAN_UNITS));

/** Источник ФАКТА показателя (какой стор/эндпоинт содержит значение). */
export const PLAN_FACT_SOURCES = [
    'kpi',
    'finance',
    'airtime',
    'calling',
] as const;
export type PlanFactSource = (typeof PLAN_FACT_SOURCES)[number];
export const PLAN_FACT_SOURCE = Object.freeze(
    createEnumObject(PLAN_FACT_SOURCES),
);

/** Период, на который руководитель задаёт значение плана. */
export const PLAN_PERIOD_TYPES = ['month', 'quarter', 'year'] as const;
export type PlanPeriodType = (typeof PLAN_PERIOD_TYPES)[number];
export const PLAN_PERIOD_TYPE = Object.freeze(
    createEnumObject(PLAN_PERIOD_TYPES),
);

export type PlanIndicatorCode = PbxSalesUserPlanFieldCode;
/** Коды показателей (runtime-enum для @IsIn и Swagger). */
export const PLAN_INDICATOR_CODES = PBX_SALES_USER_PLAN_FIELD_CODES;

export interface PlanIndicatorDef {
    code: PlanIndicatorCode;
    unit: PlanUnit;
    factSource: PlanFactSource;
    /**
     * Ключ факта в источнике: kpi → innerCode; calling → id бакета
     * (строкой); finance → поле employee-итогов; airtime → 'airtimeSeconds'
     * (фронт делит на 60).
     */
    factKey: string;
    defaultName: string;
}

/** kpi-ключ, прижатый к FilterInnerCode (опечатка не соберётся). */
const kpiKey = (key: FilterInnerCode): string => key;
/** Ключ бакета звонков, прижатый к CallingDuration. */
const callingKey = (key: CallingDuration): string => String(key);
/** Ключ employee-итогов финансов, прижатый к ClosedSalesTotalsDto. */
const financeKey = (key: keyof ClosedSalesTotalsDto): string => key;

export const PLAN_INDICATORS: readonly PlanIndicatorDef[] = [
    {
        code: PLAN_INDICATOR_CODES.calls_done,
        unit: PLAN_UNIT.count,
        factSource: PLAN_FACT_SOURCE.kpi,
        factKey: kpiKey('call_done'),
        defaultName: 'Звонки',
    },
    {
        code: PLAN_INDICATOR_CODES.presentations_done,
        unit: PLAN_UNIT.count,
        factSource: PLAN_FACT_SOURCE.kpi,
        factKey: kpiKey('presentation_done'),
        defaultName: 'Презентации',
    },
    {
        code: PLAN_INDICATOR_CODES.offers_sent,
        unit: PLAN_UNIT.count,
        factSource: PLAN_FACT_SOURCE.kpi,
        factKey: kpiKey('ev_offer_act_send'),
        defaultName: 'КП',
    },
    {
        code: PLAN_INDICATOR_CODES.invoices_sent,
        unit: PLAN_UNIT.count,
        factSource: PLAN_FACT_SOURCE.kpi,
        factKey: kpiKey('ev_invoice_act_send'),
        defaultName: 'Счета',
    },
    {
        code: PLAN_INDICATOR_CODES.sales_count,
        unit: PLAN_UNIT.count,
        factSource: PLAN_FACT_SOURCE.kpi,
        factKey: kpiKey('ev_success_done'),
        defaultName: 'Продажи (шт)',
    },
    {
        code: PLAN_INDICATOR_CODES.sales_monthly_amount,
        unit: PLAN_UNIT.money,
        factSource: PLAN_FACT_SOURCE.finance,
        factKey: financeKey('monthlyAmount'),
        defaultName: 'Месячная сумма продаж',
    },
    {
        code: PLAN_INDICATOR_CODES.advance_amount,
        unit: PLAN_UNIT.money,
        factSource: PLAN_FACT_SOURCE.finance,
        factKey: financeKey('advanceAmount'),
        defaultName: 'Аванс',
    },
    {
        code: PLAN_INDICATOR_CODES.airtime_minutes,
        unit: PLAN_UNIT.minutes,
        factSource: PLAN_FACT_SOURCE.airtime,
        factKey: 'airtimeSeconds',
        defaultName: 'Эфирное время (мин)',
    },
    {
        code: PLAN_INDICATOR_CODES.calls_over_30s,
        unit: PLAN_UNIT.count,
        factSource: PLAN_FACT_SOURCE.calling,
        factKey: callingKey(30),
        defaultName: 'Звонки > 30 сек',
    },
    {
        code: PLAN_INDICATOR_CODES.calls_over_60s,
        unit: PLAN_UNIT.count,
        factSource: PLAN_FACT_SOURCE.calling,
        factKey: callingKey(60),
        defaultName: 'Звонки > 60 сек',
    },
] as const;

/** Runtime-массив кодов (для @IsIn/Swagger enum). */
export const PLAN_INDICATOR_CODE_LIST: readonly PlanIndicatorCode[] =
    PLAN_INDICATORS.map(indicator => indicator.code);

/** Определение показателя по коду. */
export const findPlanIndicator = (
    code: string,
): PlanIndicatorDef | undefined =>
    PLAN_INDICATORS.find(indicator => indicator.code === code);

/** Полное имя Bitrix user-поля плана (UF_USR_A_SALES_PLAN_*). */
export const planIndicatorUfName = (code: PlanIndicatorCode): string => {
    const field = findPbxSalesUserPlanField(code);
    // Каталог прижат к типизации — поле обязано существовать.
    return `${USER_FIELD_PREFIX}${field!.user}`;
};

/**
 * bxUserId-сентинел строки ПОРТАЛЬНОГО конфига планов в report_settings
 * (реальные Bitrix id ≥ 1 — коллизий с user-строками нет).
 */
export const PLAN_CONFIG_SENTINEL_BX_USER_ID = 0;

/** Версия envelope конфига планов. */
export const PLANS_CONFIG_VERSION = 1;
