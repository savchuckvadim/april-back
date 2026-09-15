import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import {
    CallReportDealFamilyContext,
    CallReportDealLinkConfidence,
    CallReportDealRow,
} from './call-report-deal-lookup';
import {
    CallReportListFamily,
    CallReportListFamilyConflict,
    CallReportListSearchInput,
} from './call-report-list-truth.types';

/**
 * Чем доказана раскладка связей звонка — порядок источников §4
 * (ai/tasks/call-report-prod-fixes.md), от надёжного к запасному:
 *  - list — элемент «ОП История»/«ОП KPI» этого звонка (crm-поле записи);
 *  - root-link — сама сделка-владелец в воронке «ОП Основная» либо её поле
 *    «Корневая сделка Продажи» (факт CRM);
 *  - client-lookup — дотяжка по компании и контакту (предположение).
 */
export const CALL_REPORT_DEAL_FAMILY_SOURCES = [
    'list',
    'root-link',
    'client-lookup',
] as const;

export type CallReportDealFamilySource =
    (typeof CALL_REPORT_DEAL_FAMILY_SOURCES)[number];

/** Раскладка сделок звонка по воронкам. */
export interface CallReportDealFamily {
    /** Корневая сделка продажи — «ОП: основная сделка». */
    mainDealId?: number;
    /** Сделка воронки «ОП Презентации». */
    presentationDealId?: number;
    /** Сделка воронки «ОП ХО». */
    xoDealId?: number;
    /** Чем доказана основная связь; пусто — связи нет. */
    mainConfidence?: CallReportDealLinkConfidence;
    /** Чем доказана связь презентации; пусто — связи нет. */
    presentationConfidence?: CallReportDealLinkConfidence;
    /** Воронка сделки-владельца звонка; undefined — чужая или не заведена. */
    ownerCategoryCode?: PbxDealCategoryCodeEnum;
    /** Каким источником получена основная связь (лог и ночной ревизор). */
    source?: CallReportDealFamilySource;
    /** Элемент списка, из которого взята семья (шаг 0). */
    listRecordId?: string;
    /** Противоречивая разметка записи: две сделки одной воронки в элементе. */
    listConflicts?: readonly CallReportListFamilyConflict[];
    /** Раскладку построить не удалось (ошибка чтения, нет справочника). */
    unresolved?: boolean;
}

/** Вход поиска записи отчётности по звонку из контекста раскладки. */
export function callListSearchInputOf(
    dealId: number | undefined,
    context: CallReportDealFamilyContext,
): CallReportListSearchInput {
    return {
        entityType: dealId ? 'deal' : context.leadId ? 'lead' : null,
        entityId: dealId ?? context.leadId ?? null,
        companyId: context.companyId,
        contactId: context.contactId,
        callStartedAt: context.callStartedAt ?? null,
        callerId: context.callerId,
        callType: context.callType,
    };
}

/**
 * Перенос семьи из записи списка в раскладку (шаг 0 — источник истины §4).
 * Связи записи — факт портала, поэтому уверенность `exact`.
 *
 * @returns строку основной сделки (для долива дочерних связей) или null.
 */
export function applyListFamily(
    family: CallReportDealFamily,
    list: CallReportListFamily,
): CallReportDealRow | null {
    family.listRecordId = list.recordId;
    if (list.conflicts.length) family.listConflicts = list.conflicts;
    if (list.mainDealId) {
        family.mainDealId = list.mainDealId;
        family.mainConfidence = 'exact';
        family.source = 'list';
    }
    if (list.presentationDealId) {
        family.presentationDealId = list.presentationDealId;
        family.presentationConfidence = 'exact';
    }
    if (list.xoDealId) family.xoDealId = list.xoDealId;
    return list.mainDeal ?? null;
}

/**
 * Воронка «заперта» противоречивой разметкой записи: две сделки этой
 * воронки в одном элементе. Тогда ДОГАДКУ по клиенту делать нельзя —
 * молчаливый выбор одной из двух и есть та ошибка, ради которой заведён
 * инвариант. Факты CRM (воронка сделки-владельца, поле «Корневая сделка
 * Продажи») запретом не накрываются: это явные ссылки портала, а не выбор
 * наугад.
 */
export function listConflictBlocks(
    family: CallReportDealFamily,
    code: PbxDealCategoryCodeEnum,
): boolean {
    return (family.listConflicts ?? []).some(
        conflict => conflict.category === code,
    );
}
