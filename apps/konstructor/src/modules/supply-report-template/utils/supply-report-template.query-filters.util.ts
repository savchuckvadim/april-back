import { BadRequestException } from '@nestjs/common';
import type { SupplyReportTemplateQueryDto } from '../dto/supply-report-template-query.dto';
import { SUPPLY_REPORT_TEMPLATE_PAGE_SIZE } from '../dto/supply-report-template-query.dto';
import type { SupplyReportTemplateFindManyFilters } from '../repositories/supply-report-template.repository';

/**
 * Query → фильтры репозитория.
 *
 * `only_common` и `portal_id` взаимно исключают друг друга: вместе они
 * означают «только общие И только портала 7» — пустой список, которого
 * администратор не просил. Падаем, а не выбираем одно молча.
 *
 * `client_type`/`supply_type` в фильтры НЕ попадают: списки лежат JSON-ом
 * в LongText, операций по массивам в строковой колонке у Prisma нет,
 * а сырой SQL запрещён стандартом проекта — совпадение считается
 * в TypeScript уже после выборки.
 */
export function supplyReportTemplateQueryToFilters(
    query?: SupplyReportTemplateQueryDto,
): SupplyReportTemplateFindManyFilters {
    const filters: SupplyReportTemplateFindManyFilters = {
        take: SUPPLY_REPORT_TEMPLATE_PAGE_SIZE,
        skip: 0,
    };
    if (!query) {
        return filters;
    }

    if (query.only_common && query.portal_id !== undefined) {
        throw new BadRequestException(
            'only_common и portal_id несовместимы: выберите либо общие шаблоны, либо шаблоны портала',
        );
    }

    if (query.only_common) {
        filters.portal_id = null;
    } else if (query.portal_id !== undefined) {
        filters.portal_id = BigInt(query.portal_id);
    }

    if (query.agent_id !== undefined) {
        filters.agent_id = BigInt(query.agent_id);
    }
    if (query.is_active !== undefined) {
        filters.is_active = query.is_active;
    }
    if (query.is_archived !== undefined) {
        filters.is_archived = query.is_archived;
    }
    if (query.search) {
        filters.search = query.search;
    }
    if (query.take !== undefined) {
        filters.take = query.take;
    }
    if (query.skip !== undefined) {
        filters.skip = query.skip;
    }

    return filters;
}
