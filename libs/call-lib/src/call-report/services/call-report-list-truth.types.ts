import {
    CRM_REF_PREFIX,
    CrmRefEntityType,
} from '@lib/bitrix/domain/crm/utils/crm-ref-format.util';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import {
    SalesListCode,
    SalesListRecord,
} from '@lib/portal-lib/pbx/pbx-sales-list-reader';
import { PbxSalesKpiListFieldItemCode } from '@lib/portal-lib/pbx/pbx-sales-kpi-list/type/pbx-sales-kpi-list-field.type';
import {
    CallReportCallTypeCode,
    CallReportLinkStatusCode,
} from '../config/call-report-smart.config';
import { CallReportDealRow } from './call-report-deal-lookup';

/**
 * Типы и чистые правила «источника истины по связям» — элемента списка
 * «ОП История» / «ОП KPI» этого звонка (прод-постановка §4,
 * ai/tasks/call-report-prod-fixes.md).
 *
 * Здесь только то, что считается БЕЗ Битрикса: сборка crm-ссылок звонка,
 * разбор ссылок записи, ранжирование кандидатов и окна времени. Чтение
 * портала — в `call-report-list-truth.service.ts`.
 */

/** Окно по дате события вокруг звонка для записей клиента. */
export const CALL_LIST_WINDOW_DAYS = 3;
/** «Та же запись о том же событии»: не дальше суток с запасом на TZ. */
export const CALL_LIST_CONFIRMED_MAX_HOURS = 30;
/** Сколько записей читаем из каждого списка. */
export const CALL_LIST_CANDIDATES_LIMIT = 30;
/** Сколько сделок записи разрешено прочитать при раскладке семьи. */
export const CALL_LIST_MAX_RECORD_DEALS = 8;

/**
 * Тип звонка → коды типов событий списка, которыми менеджер о нём
 * отчитывается (items поля event_type списков sales_kpi/sales_history).
 */
export const CALL_LIST_EVENT_TYPES_BY_CALL_TYPE: Partial<
    Record<
        CallReportCallTypeCode,
        readonly PbxSalesKpiListFieldItemCode<'event_type'>[]
    >
> = {
    cold: ['xo', 'call'],
    site_lead: ['site', 'call'],
    call: ['call', 'come_call'],
    presentation: ['presentation'],
    refine: ['call', 'presentation'],
    decision: ['call_in_progress', 'call'],
    payment: ['call_in_money', 'call'],
};

/** Клиент звонка: чьи записи отчётности ищем. */
export interface CallReportCallRefs {
    /** Сущность-владелец звонка (сделка или лид); null — звонок «голый». */
    entityType: 'deal' | 'lead' | null;
    entityId: number | null;
    companyId?: number | null;
    contactId?: number | null;
}

/** Запрос «найди запись отчётности ЭТОГО звонка». */
export interface CallReportListSearchInput extends CallReportCallRefs {
    /** Момент звонка — центр окна поиска; пусто — искать не по чему. */
    callStartedAt: Date | string | null;
    /** Владелец звонка (для ранжирования по ответственному записи). */
    callerId?: string | number | null;
    /** Тип звонка (для ранжирования по типу события записи). */
    callType?: string | null;
}

/** Выбранная запись списка и уверенность привязки. */
export interface CallReportListPick {
    record: SalesListRecord;
    status: CallReportLinkStatusCode;
}

/** Итог поиска записей по звонку в обоих списках отчётности. */
export interface CallReportListSearch {
    /** Ссылки, которыми искали (D_/L_/CO_/C_). */
    crmRefs: string[];
    kpi: CallReportListPick | null;
    history: CallReportListPick | null;
    /** Прочие записи клиента рядом по времени (без выбранных). */
    rest: SalesListRecord[];
    /** Сколько кандидатов прочитано по каждому списку (для лога). */
    counts: { kpi: number; history: number };
}

/**
 * Нарушение инварианта разметки: в ОДНОМ элементе списка две сделки одной
 * воронки ОП (двух «ОП Основная» не бывает — знание владельца 08.09.2026).
 */
export interface CallReportListFamilyConflict {
    category: PbxDealCategoryCodeEnum;
    dealIds: number[];
}

/** Семья сущностей, разложенная из crm-поля записи списка. */
export interface CallReportListFamily {
    /** id записи-источника и её список. */
    recordId: string;
    listCode: SalesListCode;
    mainDealId?: number;
    /** Строка основной сделки — чтобы читатель не перечитывал её повторно. */
    mainDeal?: CallReportDealRow;
    presentationDealId?: number;
    xoDealId?: number;
    leadId?: number;
    companyId?: number;
    contactId?: number;
    /** Воронки, где разметка записи противоречива (связь оставлена пустой). */
    conflicts: CallReportListFamilyConflict[];
}

/** Пустой итог поиска — записи не искали или не нашли. */
export function emptyCallListSearch(
    crmRefs: string[] = [],
): CallReportListSearch {
    return {
        crmRefs,
        kpi: null,
        history: null,
        rest: [],
        counts: { kpi: 0, history: 0 },
    };
}

/**
 * CRM-ссылки клиента звонка в формате crm-поля списка. ТОЛЬКО то, что
 * известно о самом звонке: сущность-владелец, компания и контакт. Семью
 * сделок сюда НЕ подмешиваем — иначе запись ищется по дотянутой догадке, а
 * порядок §4 требует обратного: сначала запись звонка, потом семья из неё.
 */
export function buildCallCrmRefs(refs: CallReportCallRefs): string[] {
    const result = new Set<string>();
    if (refs.entityId) {
        if (refs.entityType === 'deal') {
            result.add(`${CRM_REF_PREFIX.DEAL}_${refs.entityId}`);
        }
        if (refs.entityType === 'lead') {
            result.add(`${CRM_REF_PREFIX.LEAD}_${refs.entityId}`);
        }
    }
    if (refs.companyId) {
        result.add(`${CRM_REF_PREFIX.COMPANY}_${refs.companyId}`);
    }
    if (refs.contactId) {
        result.add(`${CRM_REF_PREFIX.CONTACT}_${refs.contactId}`);
    }
    return [...result];
}

/** Префикс crm-ссылки → тип сущности; длинный префикс (CO_) вперёд. */
const CRM_REF_TYPE_BY_PREFIX: readonly (readonly [string, CrmRefEntityType])[] =
    (Object.entries(CRM_REF_PREFIX) as [CrmRefEntityType, string][])
        .map(([type, prefix]) => [prefix, type] as const)
        .sort((left, right) => right[0].length - left[0].length);

/**
 * Разбор значения crm-поля записи: `D_555` → сделка 555. Голый id (поле
 * с ОДНИМ разрешённым типом) типа не несёт — такую ссылку разложить
 * нельзя, возвращаем null (молча выдумывать тип сущности запрещено).
 */
export function parseCrmRef(
    raw: string,
): { type: CrmRefEntityType; id: number } | null {
    const match = /^([A-Za-z]{1,2})_(\d+)$/.exec(String(raw).trim());
    if (!match) return null;
    const prefix = match[1].toUpperCase();
    const found = CRM_REF_TYPE_BY_PREFIX.find(entry => entry[0] === prefix);
    const id = Number(match[2]);
    return found && id > 0 ? { type: found[1], id } : null;
}

/**
 * Момент события записи: поле event_date, иначе дата создания. Значение
 * свойства списка приезжает и в ISO, и в русском формате `дд.мм.гггг` —
 * второй `new Date()` не понимает, поэтому разбирается явно.
 */
export function callListEventTime(record: SalesListRecord): number | null {
    for (const raw of [record.eventDate, record.createdAt]) {
        const time = parseListDate(raw);
        if (time !== null) return time;
    }
    return null;
}

/** Момент звонка числом; null — даты нет или она непригодна. */
export function callMoment(value: Date | string | null): number | null {
    if (!value) return null;
    const time = value instanceof Date ? value.getTime() : Date.parse(value);
    return Number.isFinite(time) ? time : null;
}

function parseListDate(raw: string | null): number | null {
    if (!raw) return null;
    const ru = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(raw);
    if (ru) {
        const time = new Date(
            Number(ru[3]),
            Number(ru[2]) - 1,
            Number(ru[1]),
            Number(ru[4] ?? 0),
            Number(ru[5] ?? 0),
        ).getTime();
        return Number.isFinite(time) ? time : null;
    }
    const time = Date.parse(raw);
    return Number.isFinite(time) ? time : null;
}

/** Вход ранжирования кандидатов одного списка. */
export interface CallListRankInput {
    records: readonly SalesListRecord[];
    /** Ссылки клиента звонка — страховка от «сервер проигнорировал фильтр». */
    crmRefs: ReadonlySet<string>;
    callAt: number;
    callerId?: string | number | null;
    callType?: string | null;
}

/** Итог ранжирования: лучшая запись, её статус и остальные кандидаты. */
export interface CallListRankResult {
    best: SalesListRecord | null;
    status: CallReportLinkStatusCode;
    rest: SalesListRecord[];
}

/**
 * Выбор записи списка: только записи, действительно ссылающиеся на клиента
 * звонка, ранжирование по совпадению типа события, ответственного и
 * близости даты. `confirmed` — запись того же дня с совпавшим типом или
 * ответственным, иначе `suspected`.
 */
export function rankCallListRecords(
    input: CallListRankInput,
): CallListRankResult {
    const wantedTypes = callListEventTypes(input.callType);
    const ranked = input.records
        .filter(record => record.crmRefs.some(ref => input.crmRefs.has(ref)))
        .map(record => {
            const at = callListEventTime(record);
            return {
                record,
                distanceMs:
                    at === null ? Infinity : Math.abs(at - input.callAt),
                typeMatch: Boolean(
                    record.eventTypeCode &&
                        wantedTypes?.some(
                            code => code === record.eventTypeCode,
                        ),
                ),
                responsibleMatch: Boolean(
                    input.callerId &&
                        record.responsibleId &&
                        String(record.responsibleId) === String(input.callerId),
                ),
            };
        })
        .sort(
            (a, b) =>
                Number(b.typeMatch) - Number(a.typeMatch) ||
                Number(b.responsibleMatch) - Number(a.responsibleMatch) ||
                a.distanceMs - b.distanceMs,
        );
    const top = ranked[0];
    if (!top) return { best: null, status: 'suspected', rest: [] };
    const sameDay =
        top.distanceMs <= CALL_LIST_CONFIRMED_MAX_HOURS * 60 * 60_000;
    return {
        best: top.record,
        status:
            sameDay && (top.typeMatch || top.responsibleMatch)
                ? 'confirmed'
                : 'suspected',
        rest: ranked.slice(1).map(item => item.record),
    };
}

/** Коды типов событий списка, ожидаемые для типа звонка. */
export function callListEventTypes(
    callType: string | null | undefined,
): readonly PbxSalesKpiListFieldItemCode<'event_type'>[] | undefined {
    if (!callType) return undefined;
    return CALL_LIST_EVENT_TYPES_BY_CALL_TYPE[
        callType as CallReportCallTypeCode
    ];
}
