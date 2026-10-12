import type { Prisma } from 'generated/prisma';
import {
    listMatches,
    parseClientTypes,
    parseSupplyTypes,
} from '@lib/portal-lib/konstructor/document-template';
import type {
    ClientTypeEnum,
    CONTRACT_LTYPE,
    SupplyTypeEnum,
} from '../dto/contract-template.enums';
import type { ContractTemplateFindManyFilters } from '../repositories/contract-template.repository';

/**
 * Сборка `where` для списка шаблонов договора.
 *
 * ### Почему `client_types` / `supply_types` здесь НЕТ
 *
 * Оба признака хранятся JSON-массивом в колонке `LongText`. У Prisma нет
 * операций по элементам массива внутри строковой колонки (`has`/`hasSome`
 * работают только со `scalar list`, которых MySQL-провайдер не поддерживает),
 * а сырой SQL в проекте запрещён. Поэтому оба признака фильтруются в
 * TypeScript ПОСЛЕ выборки — функцией
 * {@link filterByTemplateLists} ниже, через `listMatches` из общей
 * библиотеки резолвера (единая семантика: `null` = «годится любому»).
 *
 * Практическое следствие: когда фильтр по этим признакам задан, `total`
 * нельзя считать в SQL — он соврёт. Сервис в этом случае берёт выборку
 * целиком (`findAll`), фильтрует, и уже потом нарезает страницу.
 *
 * ### Поиск
 *
 * Ищем по `name` и `code`. `description` — `Text`, поиск `contains` по нему
 * даёт полный скан без индекса и в выдаче почти всегда мусор; у шаблонов
 * счёта он в поиск включён, здесь это сознательно не копируется.
 */
export function buildContractTemplateWhere(
    filters: ContractTemplateFindManyFilters,
): Prisma.ContractTemplateWhereInput {
    const where: Prisma.ContractTemplateWhereInput = {};

    // «Только общие» — это portal_id IS NULL, а не «без фильтра».
    // Проверяется ПЕРВЫМ: явный запрос общих сильнее переданного portal_id.
    if (filters.only_common) {
        where.portal_id = null;
    } else if (filters.portal_id_or_common !== undefined) {
        // Портальные + унаследованные общие: именно это нужно админке
        // портала. У шаблонов счёта GET /portal/:id общие теряет.
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

    // contract_type есть ТОЛЬКО у contract_templates — у шаблонов счёта и
    // отчёта о поставке такой колонки нет, фильтровать по ней там нельзя.
    if (filters.contract_type !== undefined) {
        where.contract_type = filters.contract_type;
    }

    if (filters.is_active !== undefined) {
        where.is_active = filters.is_active;
    }

    if (filters.is_archived !== undefined) {
        where.is_archived = filters.is_archived;
    }

    const search = filters.search?.trim();
    if (search) {
        const searchOr: Prisma.ContractTemplateWhereInput[] = [
            { name: { contains: search } },
            { code: { contains: search } },
        ];
        if (where.OR === undefined) {
            where.OR = searchOr;
        } else {
            // Уже есть OR по порталу — два независимых OR нельзя слить в
            // один массив (получится «портал ИЛИ совпало имя», то есть
            // поиск начнёт возвращать чужие порталы). Заворачиваем в AND.
            where.AND = [{ OR: where.OR }, { OR: searchOr }];
            delete where.OR;
        }
    }

    return where;
}

/**
 * Область «шаблон по умолчанию».
 *
 * КРИТИЧНО: в область входит `contract_type`. Без него установка шаблона
 * по умолчанию для `service` молча снимала бы флаг у шаблона по умолчанию
 * для `abon` — у портала остался бы один шаблон по умолчанию на все типы
 * договора, а остальные типы потеряли бы свой. Именно это даёт
 * `buildClearOtherDefaultsWhereInput` у шаблонов счёта, где
 * `contract_type` нет вовсе.
 *
 * `is_archived: false` — архивные не участвуют в подборе, трогать их флаг
 * незачем (и не нужно поднимать их `updated_at`).
 */
export function buildClearOtherDefaultsWhere(
    portal_id: bigint | null,
    agent_id: bigint | null,
    contract_type: CONTRACT_LTYPE,
    exceptId: bigint,
): Prisma.ContractTemplateWhereInput {
    return {
        id: { not: exceptId },
        portal_id,
        agent_id,
        contract_type,
        is_archived: false,
        is_default: true,
    };
}

/** Признаки-списки, по которым фильтруем уже в TypeScript. */
export type TemplateListFilter = {
    client_type?: ClientTypeEnum;
    supply_type?: SupplyTypeEnum;
};

/** Строка, у которой есть только нужные для пост-фильтра колонки. */
export type TemplateListRow = {
    client_types: string | null;
    supply_types: string | null;
};

/**
 * Пост-фильтр по `client_types` / `supply_types`.
 *
 * Семантику задаёт `listMatches` из общей библиотеки: `null` в колонке —
 * «годится любому» и подходит всегда; заполненный список подходит, только
 * если запрошенное значение в нём есть. Фильтр не задан — строка проходит.
 */
export function filterByTemplateLists<T extends TemplateListRow>(
    rows: readonly T[],
    filter: TemplateListFilter,
): T[] {
    if (filter.client_type === undefined && filter.supply_type === undefined) {
        return [...rows];
    }

    return rows.filter(row => {
        if (
            filter.client_type !== undefined &&
            !listMatches(parseClientTypes(row.client_types), filter.client_type)
        ) {
            return false;
        }
        if (
            filter.supply_type !== undefined &&
            !listMatches(parseSupplyTypes(row.supply_types), filter.supply_type)
        ) {
            return false;
        }
        return true;
    });
}
