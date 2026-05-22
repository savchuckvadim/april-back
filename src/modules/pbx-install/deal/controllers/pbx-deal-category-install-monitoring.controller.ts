import { Controller, Get, Param } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';

import { PbxEntityGroupEnum } from '../../shared/entity/field/parse-entity-field.service';
import {
    PARSE_CATEGORY_NAME_VALUES,
    ParseCategoryName,
    ParseCategoryService,
} from '../services/categories/parse-category.service';
import { EntityParseCategoryDataDto } from '../dto/parse-category.dto';
import {
    PbxDealCategoryMonitoringResult,
    PbxDealCategoryMonitoringService,
} from '../services/categories/pbx-deal-category-monitoring.service';
import {
    PbxDealCategorySearchResultResponse,
    PbxDealCategorySearchService,
} from '../services/categories/pbx-deal-category-search.service';

@ApiTags('PBX Deal Category Install Monitoring')
@Controller('pbx-deal-category-install-monitoring')
export class PbxDealCategoryInstallMonitoringController {
    constructor(
        private readonly parseDealCategoryService: ParseCategoryService,
        private readonly monitoringService: PbxDealCategoryMonitoringService,
        private readonly searchService: PbxDealCategorySearchService,
    ) {}

    @ApiOperation({
        summary: 'Get deal categories and stages by domain',
        description:
            'Получить "Deal Categories Data" для Портала — категории и стадии сделки ' +
            'из "Bitrix" (`crm.category.list` + `crm.status.list`) и "PortalDB" ' +
            '(`btx_categories` + `btx_stages`), смерженные по `code`/`bitrixId`.',
    })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @Get('domain/:domain')
    async getCategoriesByDomain(
        @Param('domain') domain: string,
    ): Promise<PbxDealCategoryMonitoringResult> {
        return await this.monitoringService.getPbxDealCategoriesByDomain(
            domain,
        );
    }

    @ApiOperation({
        summary: 'Get deal categories parse data',
        description:
            'Получить распарсенные категории (воронки) и стадии сделки из Excel-файла установки. ' +
            'Источник — `ParseCategoryService.getParsedData`.',
    })
    @ApiParam({
        name: 'categoryName',
        enum: PARSE_CATEGORY_NAME_VALUES as unknown as string[],
        description:
            'Внутренний код категории (`sales_base`, `sales_xo`, `sales_presentation`, ' +
            '`tmc_base`, `service_base`) либо `all` для всех категорий.',
    })
    @ApiParam({
        name: 'group',
        enum: PbxEntityGroupEnum,
        description:
            'Группа отдела: `sales` или `service`. Определяет папку Excel-файла.',
    })
    @ApiOkResponse({
        description: 'Распарсенные категории сделки со стадиями.',
        type: EntityParseCategoryDataDto,
    })
    @Get('/parse/:categoryName/:group')
    async getCategoriesParseData(
        @Param('categoryName') categoryName: ParseCategoryName,
        @Param('group') group: PbxEntityGroupEnum,
    ): Promise<EntityParseCategoryDataDto> {
        return await this.parseDealCategoryService.getParsedData(
            categoryName,
            group,
        );
    }

    @ApiOperation({
        summary: 'Search pbx deal category parse data',
        description:
            'Поиск категории сделки по подстроке в `code`/`name`/`title` шаблона. ' +
            'Для каждого совпадения подкладывается состояние из портальной БД и Bitrix.',
    })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @ApiParam({ name: 'group', enum: PbxEntityGroupEnum })
    @ApiParam({ name: 'search', description: 'Подстрока для поиска' })
    @Get('/search/:domain/:group/:search')
    async searchCategory(
        @Param('domain') domain: string,
        @Param('group') group: PbxEntityGroupEnum,
        @Param('search') search: string,
    ): Promise<PbxDealCategorySearchResultResponse> {
        return await this.searchService.search(domain, group, search);
    }
}
