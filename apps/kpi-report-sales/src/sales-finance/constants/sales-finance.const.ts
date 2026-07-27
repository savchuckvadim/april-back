/**
 * Константы модуля sales-finance: ключи кэша, TTL, WS-события,
 * runtime-массивы union-литералов для DTO (@IsIn + Swagger enum).
 * Никаких магических строк в остальном коде модуля (ai/rules/pbx-typing.md).
 */
import { PbxDealSalesBaseStageCode } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';

/**
 * v2: в сделки добавлены companyId/companyName — месячные сегменты,
 * закэшированные до этого, несовместимы. Старые ключи v1 умрут по TTL.
 */
// v3: сделки обзавелись companyColor (перспектива) — старые v2-ключи в
// кэше без этого поля инвалидируются сменой префикса (протухнут по TTL).
// v4: closed/hot сделки обзавелись quantity, hot — paidMonths (кол-во
// товара и предоплаченные месяцы) — старые v3-ключи протухнут по TTL.
// v5: + contractTypeCode/companyClientType (оба DTO) и contractStart/
// contractEnd у горячих (pbx-fields) — старые v4-ключи протухнут по TTL.
// v6: + contractTypeName (live-словарь типов договора), opMHistory у
// горячих, кэш товарных строк per-сделка (версия по DATE_MODIFY).
export const SALES_FINANCE_CACHE_PREFIX = 'sales-finance:v6' as const;

/** TTL сегмента полного прошлого месяца: данные закрыты, живут долго. */
export const SALES_FINANCE_PAST_MONTH_TTL_SECONDS = 60 * 60 * 24 * 30;

/** TTL смёрженного итога и hot-clients: текущие данные меняются. */
export const SALES_FINANCE_RESULT_TTL_SECONDS = 60 * 3;

/**
 * TTL кэша товарных строк ОДНОЙ сделки. Версия ключа включает DATE_MODIFY
 * сделки: изменилась сделка → другой ключ (промах), старая ячейка
 * протухнет сама. Поэтому TTL длинный.
 */
export const SALES_FINANCE_ROWS_TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * TTL живого словаря типов договора (crm.deal.userfield.list): включает
 * типы, добавленные на портале руками мимо инсталляции (их нет в
 * портальной БД bitrixfield_items).
 */
export const SALES_FINANCE_DICT_TTL_SECONDS = 60 * 60;

export const SALES_FINANCE_WS_EVENTS = {
    CLOSED_SALES_DONE: 'sales-finance:closed-sales:done',
    CLOSED_SALES_ERROR: 'sales-finance:closed-sales:error',
    HOT_CLIENTS_DONE: 'sales-finance:hot-clients:done',
    HOT_CLIENTS_ERROR: 'sales-finance:hot-clients:error',
} as const;

/** Порог «горячести»: от какой стадии и выше берём открытые сделки. */
export const SALES_HOT_THRESHOLDS = ['presentation', 'document'] as const;
export type SalesHotThreshold = (typeof SALES_HOT_THRESHOLDS)[number];

/** Порог → код стадии лестницы sales_base. */
export const SALES_HOT_THRESHOLD_STAGE_CODE = {
    presentation: 'sales_pres',
    document: 'sales_offer_create',
} as const satisfies Record<SalesHotThreshold, PbxDealSalesBaseStageCode>;

export const SALES_FINANCE_RESPONSE_STATUSES = ['ready', 'queued'] as const;
export type SalesFinanceResponseStatus =
    (typeof SALES_FINANCE_RESPONSE_STATUSES)[number];

export const SALES_FINANCE_CACHE_SCOPES = ['closed', 'hot', 'all'] as const;
export type SalesFinanceCacheScope =
    (typeof SALES_FINANCE_CACHE_SCOPES)[number];
/** Объект-enum scope'ов (типизированный доступ без строковых литералов). */
export const SALES_FINANCE_CACHE_SCOPE = Object.freeze(
    Object.fromEntries(
        SALES_FINANCE_CACHE_SCOPES.map(scope => [scope, scope]),
    ) as { [Scope in SalesFinanceCacheScope]: Scope },
);

/** Сегменты ключей кэша (между prefix/domain и деталями). */
export const SALES_FINANCE_CACHE_SECTIONS = {
    CLOSED: 'closed',
    HOT: 'hot',
    MONTH: 'month',
    RESULT: 'result',
    /** Товарные строки одной сделки (версия по DATE_MODIFY). */
    ROWS: 'rows',
    /** Живые словари полей (типы договора). */
    DICT: 'dict',
} as const;
