import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { SmartGroupEnum, SmartNameEnum } from '../dto/install-smart.dto';
import { ParseSmartService } from '../services/parse/parse-smart.service';
import { Smart } from '../type/parse.type';
import {
    PbxSmartCategoryMonitoringResult,
    PbxSmartCategoryMonitoringService,
} from '../services/categories/pbx-smart-category-monitoring.service';
import {
    PbxSmartCategorySearchResultResponse,
    PbxSmartCategorySearchService,
} from '../services/categories/pbx-smart-category-search.service';

@ApiTags('PBX Smart Category Install Monitoring')
@Controller('pbx-smart-category-install-monitoring')
export class PbxSmartCategoryInstallMonitoringController {
    constructor(
        private readonly monitoringService: PbxSmartCategoryMonitoringService,
        private readonly parseSmartService: ParseSmartService,
        private readonly searchService: PbxSmartCategorySearchService,
    ) {}

    @ApiOperation({
        summary: 'Get smart categories and stages by domain, smartName and group',
        description:
            'Получить "Smart Category Data" для конкретного смарта на портале: ' +
            'портал-БД (`btx_categories` + `btx_stages`) + Bitrix ' +
            '(`crm.category.list` + `crm.status.list`), смерженные по `code`/`bitrixId`.',
    })
    @ApiParam({ name: 'domain', description: 'Домен Bitrix-портала' })
    @ApiParam({ name: 'smartName', enum: SmartNameEnum })
    @ApiParam({ name: 'group', enum: SmartGroupEnum })
    @Get('domain/:domain/smartName/:smartName/group/:group')
    async getSmartCategoriesByDomain(
        @Param('domain') domain: string,
        @Param('smartName') smartName: SmartNameEnum,
        @Param('group') group: SmartGroupEnum,
    ): Promise<PbxSmartCategoryMonitoringResult> {
        return await this.monitoringService.getPbxSmartCategoriesByDomain(
            domain,
            smartName,
            group,
        );
    }

    @ApiOperation({
        summary: 'Get smart categories parse data',
        description:
            'Получить распарсенный шаблон смарта из Excel ' +
            '(`install/<group>/smart/<smartName>/data.xlsx`). ' +
            'Возвращает полную модель смарта (поля + категории + стадии); ' +
            'для отдельной проверки только категорий используйте `smart[0].categories` из ответа.',
    })
    @ApiParam({ name: 'smartName', enum: SmartNameEnum })
    @ApiParam({ name: 'group', enum: SmartGroupEnum })
    @Get('parse/:smartName/:group')
    async parseSmartCategories(
        @Param('smartName') smartName: SmartNameEnum,
        @Param('group') group: SmartGroupEnum,
    ): Promise<Smart[]> {
        return await this.parseSmartService.getParsedData(smartName, group);
    }

    @ApiOperation({
        summary: 'Search smart category by substring',
        description:
            'Поиск воронки смарта по подстроке в `code`/`name`/`title` шаблона. ' +
            'Для каждого совпадения подкладывается срез из портальной БД и Bitrix.',
    })
    @ApiParam({ name: 'domain', description: 'Домен Bitrix-портала' })
    @ApiParam({ name: 'smartName', enum: SmartNameEnum })
    @ApiParam({ name: 'group', enum: SmartGroupEnum })
    @ApiParam({ name: 'search', description: 'Подстрока для поиска' })
    @Get('search/:domain/:smartName/:group/:search')
    async searchSmartCategory(
        @Param('domain') domain: string,
        @Param('smartName') smartName: SmartNameEnum,
        @Param('group') group: SmartGroupEnum,
        @Param('search') search: string,
    ): Promise<PbxSmartCategorySearchResultResponse> {
        return await this.searchService.search(domain, smartName, group, search);
    }
}
