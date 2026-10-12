import {
    DocumentTemplateKind,
    TemplateAmbiguityBucket,
} from '../document-template.criteria';
import { TemplateDefaultRow } from '../document-template.repository';
import { parseClientTypes, parseSupplyTypes } from './template-lists.util';

/**
 * Группировка строк «по умолчанию» в ящики и отбор конфликтных.
 *
 * Чистая функция: ни DI, ни Prisma, ни Nest — чтобы матрицу случаев можно
 * было покрыть без БД, ровно как `rankTemplates`.
 *
 * ЯЩИК — это группа строк с полностью совпадающим набором признаков
 * отбора: (kind, portal_id, agent_id, contract_type, client_types,
 * supply_types). Внутри одного ящика резолвер сравнивает кандидатов
 * кортежем, у которого ВСЕ разряды, кроме `isDefault` и `recency`, равны.
 * Поэтому два `is_default` в одном ящике — это ровно тот случай, когда
 * выбор перестаёт быть осмысленным: победитель детерминирован (ничью
 * разрешает id), но определяется он id, а не настройкой администратора.
 */

/**
 * Ключ группировки.
 *
 * Списки НОРМАЛИЗУЮТСЯ перед склейкой в ключ: разбираются через те же
 * `parseClientTypes`/`parseSupplyTypes`, что использует резолвер, затем
 * сортируются. Без этого `["org","ip"]` и `["ip","org"]` попали бы в
 * разные ящики, хотя для отбора они ОДНО И ТО ЖЕ — и конфликт остался бы
 * незамеченным. По той же причине ключ строится от разобранного вида, а
 * не от сырой строки: `null`, `""`, `"[]"` и `"[\"мусор\"]"` все означают
 * «годится любому».
 *
 * Разделитель `\u0000` не встречается ни в enum-кодах, ни в decimal-id,
 * поэтому склейка однозначна.
 */
const SEP = '\u0000';

type NormalizedRow = {
    row: TemplateDefaultRow;
    key: string;
    clientTypes: ReturnType<typeof parseClientTypes>;
    supplyTypes: ReturnType<typeof parseSupplyTypes>;
};

const sortedOrNull = <T extends string>(list: T[] | null): T[] | null =>
    list === null ? null : [...list].sort();

function normalize(row: TemplateDefaultRow): NormalizedRow {
    const clientTypes = sortedOrNull(parseClientTypes(row.clientTypes));
    const supplyTypes = sortedOrNull(parseSupplyTypes(row.supplyTypes));

    const key = [
        row.kind,
        row.portalId === null ? '' : String(row.portalId),
        row.agentId === null ? '' : String(row.agentId),
        // У отчёта и счёта колонки contract_type нет — там всегда null,
        // и ящики по этому разряду не расходятся.
        row.contractType ?? '',
        clientTypes === null ? '*' : clientTypes.join(','),
        supplyTypes === null ? '*' : supplyTypes.join(','),
    ].join(SEP);

    return { row, key, clientTypes, supplyTypes };
}

/**
 * Ящики, в которых больше одной строки `is_default`.
 *
 * На входе — УЖЕ отфильтрованные строки с `is_default = true` и
 * `is_active = true` (неактивную и архивную строку резолвер не видит,
 * поэтому конфликтом она не является). Порядок результата
 * детерминирован: сначала общие ящики (их конфликт достаётся всем
 * порталам сразу — чинить надо первыми), затем по ключу.
 */
export function findAmbiguousBuckets(
    rows: readonly TemplateDefaultRow[],
): TemplateAmbiguityBucket[] {
    const groups = new Map<string, NormalizedRow[]>();

    for (const row of rows) {
        const normalized = normalize(row);
        const bucket = groups.get(normalized.key);
        if (bucket) {
            bucket.push(normalized);
        } else {
            groups.set(normalized.key, [normalized]);
        }
    }

    const buckets: TemplateAmbiguityBucket[] = [];

    for (const group of groups.values()) {
        if (group.length < 2) {
            continue;
        }
        const first = group[0];
        buckets.push({
            kind: first.row.kind,
            portalId:
                first.row.portalId === null ? null : String(first.row.portalId),
            agentId:
                first.row.agentId === null ? null : String(first.row.agentId),
            contractType: first.row.contractType ?? null,
            clientTypes: first.clientTypes,
            supplyTypes: first.supplyTypes,
            defaultCount: group.length,
            // Сортировка id делает ответ стабильным между вызовами:
            // порядок строк из Prisma без orderBy не гарантирован.
            // compareTemplateIds, а не .sort(): у договора и отчёта id —
            // десятичный BIGINT, и строковая сортировка дала бы
            // ['100','17','42','9'] вместо числового порядка.
            templateIds: group
                .map(item => item.row.id)
                .sort(compareTemplateIds),
            isCommon: first.row.portalId === null,
        });
    }

    return buckets.sort(compareBuckets);
}

function compareBuckets(
    a: TemplateAmbiguityBucket,
    b: TemplateAmbiguityBucket,
): number {
    if (a.isCommon !== b.isCommon) {
        return a.isCommon ? -1 : 1;
    }
    if (a.kind !== b.kind) {
        return a.kind.localeCompare(b.kind);
    }
    const portal = (a.portalId ?? '').localeCompare(b.portalId ?? '');
    if (portal !== 0) {
        return portal;
    }
    return compareTemplateIds(a.templateIds[0] ?? '', b.templateIds[0] ?? '');
}

/**
 * Виды документов, по которым портал живёт на общих шаблонах.
 *
 * Не ошибка, но админ должен это видеть: правка общей строки поедет сразу
 * во все порталы, у которых своей строки нет. Поддерживаются три вида —
 * КП (`OFFER_WORD`) намеренно вне общего резолвера, см. докблок
 * `DocumentTemplatePrismaRepository`.
 */
export const RESOLVABLE_KINDS: readonly DocumentTemplateKind[] = [
    DocumentTemplateKind.CONTRACT,
    DocumentTemplateKind.SUPPLY_REPORT,
    DocumentTemplateKind.INVOICE,
];

export function findKindsRelyingOnCommon(
    kindsWithOwnRows: readonly DocumentTemplateKind[],
): DocumentTemplateKind[] {
    const own = new Set(kindsWithOwnRows);
    return RESOLVABLE_KINDS.filter(kind => !own.has(kind));
}

/**
 * Сравнение id шаблонов для стабильного отображения.
 *
 * У договора и отчёта о поставке id — BIGINT, приведённый к строке, у счёта —
 * CHAR(36)-uuid. Для чисто числовых строк сравниваем ЧИСЛА (через BigInt, чтобы
 * не терять точность выше 2^53), иначе — лексикографически.
 */
function compareTemplateIds(a: string, b: string): number {
    const numeric = /^d+$/;
    if (numeric.test(a) && numeric.test(b)) {
        const left = BigInt(a);
        const right = BigInt(b);
        return left === right ? 0 : left < right ? -1 : 1;
    }
    return a.localeCompare(b);
}
