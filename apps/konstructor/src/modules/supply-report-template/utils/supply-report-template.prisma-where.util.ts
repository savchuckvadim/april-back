import type { Prisma } from 'generated/prisma';
import type { SupplyReportTemplateFindManyFilters } from '../repositories/supply-report-template.repository';

/**
 * Where для списка.
 *
 * Разделение `undefined` и `null` здесь СМЫСЛОВОЕ, а не стилистическое:
 *  - `portal_id: undefined` — фильтра нет, видны и портальные, и общие;
 *  - `portal_id: null` — только общие (`portal_id IS NULL`);
 *  - `portal_id: 7n` — только портала 7.
 * Запись через `??` склеила бы первый и второй случаи и показала бы
 * администратору не тот список.
 *
 * `portal_id_or_common` — третий случай: «шаблоны портала И унаследованные
 * общие» (`portal_id IN (x, NULL)`). Он сильнее `portal_id`, потому что
 * задаётся не админкой, а самим маршрутом `GET /portal/:portal_id`.
 *
 * `contract_type` не фильтруется никогда: такой колонки у
 * `supply_report_templates` нет.
 */
export function buildSupplyReportTemplateWhere(
    filters: SupplyReportTemplateFindManyFilters,
): Prisma.SupplyReportTemplateWhereInput {
    const where: Prisma.SupplyReportTemplateWhereInput = {};

    if (filters.portal_id_or_common !== undefined) {
        where.OR = [
            { portal_id: filters.portal_id_or_common },
            { portal_id: null },
        ];
    } else if (filters.portal_id !== undefined) {
        where.portal_id = filters.portal_id;
    }
    if (filters.agent_id !== undefined) {
        where.agent_id = filters.agent_id;
    }
    if (filters.is_active !== undefined) {
        where.is_active = filters.is_active;
    }
    if (filters.is_archived !== undefined) {
        where.is_archived = filters.is_archived;
    }

    const query = filters.search?.trim();
    if (query) {
        const searchOr: Prisma.SupplyReportTemplateWhereInput[] = [
            { name: { contains: query } },
            { code: { contains: query } },
            { description: { contains: query } },
        ];
        if (where.OR === undefined) {
            where.OR = searchOr;
        } else {
            // Уже есть OR по порталу. Слить два независимых OR в один
            // массив нельзя: получится «портал ИЛИ совпало имя», и поиск
            // начнёт возвращать шаблоны чужих порталов. Заворачиваем в AND.
            where.AND = [{ OR: where.OR }, { OR: searchOr }];
            delete where.OR;
        }
    }

    return where;
}

/**
 * Where для снятия флага «по умолчанию» у остальных шаблонов области.
 *
 * Область = (портал, поставщик). `contract_type` в область НЕ входит:
 * у отчёта о поставке этой колонки нет, поэтому попытка сузить область
 * по типу договора молча оставила бы два шаблона с is_default.
 *
 * Архивные намеренно исключены: у них флаг уже ни на что не влияет,
 * а лишний UPDATE по архиву — мусорная запись.
 */
export function buildClearOtherDefaultsWhere(
    portal_id: bigint | null,
    agent_id: bigint | null,
    exceptId: bigint,
): Prisma.SupplyReportTemplateWhereInput {
    return {
        id: { not: exceptId },
        portal_id,
        agent_id,
        is_archived: false,
        // Только те, у кого флаг реально стоит: UPDATE по остальным поднял
        // бы им updated_at без изменения смысла.
        is_default: true,
    };
}
