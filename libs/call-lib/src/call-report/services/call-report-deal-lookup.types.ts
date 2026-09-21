import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';

/**
 * Контракты и константы чтения сделок для раскладки связей звонка — вынесены
 * из `call-report-deal-lookup.ts`, чтобы класс поиска остался в лимите файла.
 */

/**
 * Минимальный контракт api-инстанса Битрикса: инстанс уже привязан к
 * домену портала и передаётся АРГУМЕНТОМ (правило CLAUDE.md про
 * `this.bitrix` в `@Injectable()`), поэтому класс поиска не `@Injectable()`.
 */
export interface CallReportDealLookupApi {
    call(method: string, data: Record<string, unknown>): Promise<unknown>;
}

/** Строка сделки из Битрикса в объёме, который нужен раскладке связей. */
export type CallReportDealRow = Record<string, unknown>;

/**
 * Безопасная строка из значения Битрикса: строку/число берём как есть,
 * массив и объект дают пусто (а не «[object Object]») — поле могло
 * приехать множественным или структурой.
 */
export function callReportDealText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return '';
}

/**
 * Насколько связь доказана:
 * - exact — воронка сделки или явная crm-ссылка портала (факт);
 * - likely — у клиента ровно одна сделка нужной воронки (дотяжка);
 * - guess — сделок несколько, взята ближайшая по времени к звонку.
 */
export type CallReportDealLinkConfidence = 'exact' | 'likely' | 'guess';

/** Клиент звонка — по нему дотягивается сделка, если владелец не подошёл. */
export interface CallReportDealFamilyContext {
    companyId?: number;
    contactId?: number;
    /** Дата звонка — для выбора ближайшей сделки при нескольких кандидатах. */
    callStartedAt?: Date | null;
    /** Лид-владелец звонка — поиск элемента «ОП История» (шаг 0, §4). */
    leadId?: number;
    /** Владелец звонка и тип звонка — ранжирование записи отчётности. */
    callerId?: string | number | null;
    callType?: string | null;
}

/** Найденная сделка и то, чем она доказана. */
export interface CallReportDealMatch {
    id: number;
    deal: CallReportDealRow;
    confidence: CallReportDealLinkConfidence;
}

/** Воронки ОП, по которым раскладываются связи смарт-элемента. */
export const CALL_REPORT_DEAL_CATEGORY_CODES = [
    PbxDealCategoryCodeEnum.sales_base,
    PbxDealCategoryCodeEnum.sales_presentation,
    PbxDealCategoryCodeEnum.sales_xo,
] as const;

/**
 * Поля сделки для `crm.deal.list` в раскладке звонка: воронка, стадия,
 * закрытость, ответственный и даты. ЕДИНЫЙ набор для всех читателей сделок
 * звонка (раскладка связей, кандидаты агента) — расширять список надо здесь,
 * а не копией рядом: иначе один читатель видит поле, другой нет.
 */
export const CALL_REPORT_DEAL_SELECT = [
    'ID',
    'CATEGORY_ID',
    'STAGE_ID',
    'CLOSED',
    'ASSIGNED_BY_ID',
    'DATE_CREATE',
    'DATE_MODIFY',
] as const;
