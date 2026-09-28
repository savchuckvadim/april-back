/**
 * Подписи KPI-фактов ячейки словами: код item-а `event_type` списка
 * sales_kpi («call_in_money») → его название («Звонок по оплате»), код
 * причины отсутствия факта → русская фраза. Коды наружу в текстах
 * витрины не ходят (правило владельца); чужой код остаётся как есть.
 *
 * Чистые функции над справочником полей KPI-списка.
 */
import { AI_ANALYTICS_EVENT_KINDS } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { PBX_SALES_KPI_LIST_FIELDS } from '@lib/portal-lib/pbx/pbx-sales-kpi-list/type/pbx-sales-kpi-list-field.type';

const EVENT_TYPE_FIELD_CODE = 'event_type';

/** Префикс причины «item KPI-списка не заведён на портале». */
const KPI_ITEM_MISSING_PREFIX = 'kpi-item-missing:';

const EVENT_TYPE_TITLES: ReadonlyMap<string, string> = new Map(
    PBX_SALES_KPI_LIST_FIELDS.filter(
        field => field.code === EVENT_TYPE_FIELD_CODE,
    ).flatMap(field =>
        'items' in field
            ? field.items.map(item => [item.code, item.name] as const)
            : [],
    ),
);

/** Причины карты типов (`kpiReason` в AI_ANALYTICS_EVENT_KINDS) словами. */
const KPI_REASON_TEXTS: Readonly<Record<string, string>> = {
    [AI_ANALYTICS_EVENT_KINDS.refine.kpiReason]:
        'доработки в KPI-списке считаются вместе со звонками',
    [AI_ANALYTICS_EVENT_KINDS.other.kpiReason]:
        'тип «Другое» отдельным показателем не считается',
    [AI_ANALYTICS_EVENT_KINDS.irrelevant.kpiReason]:
        'нерелевантные звонки отдельным показателем не считаются',
};

/** Название KPI-показателя по коду item-а; чужой код — как есть. */
export function kpiEventTitle(code: string): string {
    return EVENT_TYPE_TITLES.get(code) ?? code;
}

/** Причина отсутствия факта словами; нет причины — «нет данных». */
export function kpiReasonText(reason: string | undefined): string {
    if (reason === undefined || reason === '') return 'нет данных';
    if (reason.startsWith(KPI_ITEM_MISSING_PREFIX)) {
        const code = reason.slice(KPI_ITEM_MISSING_PREFIX.length);

        return `на портале нет показателя «${kpiEventTitle(code)}»`;
    }

    return KPI_REASON_TEXTS[reason] ?? reason;
}
