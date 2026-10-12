import { Prisma } from 'generated/prisma';
import {
    listMatches,
    parseClientTypes,
    parseSupplyTypes,
} from '@lib/portal-lib/konstructor/document-template';
import type { OfferTemplateFilters } from '../types/offer-template-filters.type';

/**
 * Часть фильтров, которую умеет выразить SQL.
 *
 * `portal_id` разворачивается в `some` по join-таблице: у OfferTemplate НЕТ
 * скалярной колонки portal_id, привязка живёт в offer_template_portal.
 * `agent_id` — обычная скалярная колонка, фильтруется напрямую.
 */
export function buildOfferTemplateWhereInput(
    filters?: OfferTemplateFilters,
): Prisma.OfferTemplateWhereInput {
    const where: Prisma.OfferTemplateWhereInput = {};
    if (!filters) {
        return where;
    }

    if (filters.visibility) {
        where.visibility = filters.visibility;
    }
    if (filters.is_active !== undefined) {
        where.is_active = filters.is_active;
    }
    if (filters.search) {
        where.OR = [
            { name: { contains: filters.search } },
            { code: { contains: filters.search } },
            { tags: { contains: filters.search } },
        ];
    }
    if (filters.portal_id !== undefined) {
        where.offerTemplatePortal = {
            some: { portal_id: filters.portal_id },
        };
    }
    if (filters.agent_id !== undefined) {
        where.agent_id = filters.agent_id;
    }

    return where;
}

/**
 * Остаток фильтров, который SQL выразить не может: `client_types` и
 * `supply_types` — JSON-массивы в LongText, у Prisma нет операций по
 * массивам в строковой колонке, а сырой SQL запрещён правилом проекта.
 *
 * `listMatches` трактует NULL как «годится любому», поэтому универсальные
 * шаблоны остаются в выборке при любом запрошенном значении.
 */
export function matchesOfferTemplateListFilters(
    row: {
        client_types?: string | null;
        supply_types?: string | null;
    },
    filters?: OfferTemplateFilters,
): boolean {
    if (!filters) {
        return true;
    }
    if (
        filters.client_type !== undefined &&
        !listMatches(
            parseClientTypes(row.client_types ?? null),
            filters.client_type,
        )
    ) {
        return false;
    }
    if (
        filters.supply_type !== undefined &&
        !listMatches(
            parseSupplyTypes(row.supply_types ?? null),
            filters.supply_type,
        )
    ) {
        return false;
    }
    return true;
}
