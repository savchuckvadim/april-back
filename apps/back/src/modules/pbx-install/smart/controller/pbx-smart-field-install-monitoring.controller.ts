import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Smart } from '../type/parse.type';
import { SmartGroupEnum, SmartNameEnum } from '../dto/install-smart.dto';
import { ParseSmartService } from '../services/parse/parse-smart.service';
import {
    PbxSmartFieldMonitoringResult,
    PbxSmartFieldMonitoringService,
} from '../services/fields/pbx-smart-field-monitoring.service';
import {
    PbxSmartFieldSearchResultResponse,
    PbxSmartFieldSearchService,
} from '../services/fields/pbx-smart-field-search.service';

@ApiTags('PBX Smart Field Install Monitoring')
@Controller('pbx-smart-field-install-monitoring')
export class PbxSmartFieldInstallMonitoringController {
    constructor(
        private readonly monitoringService: PbxSmartFieldMonitoringService,
        private readonly parseSmartService: ParseSmartService,
        private readonly searchService: PbxSmartFieldSearchService,
    ) {}

    @ApiOperation({
        summary: 'Get smart fields data by domain, smartName and group',
        description:
            'Получить "Smart Field Data" для конкретного смарта на портале: ' +
            'портал-БД (`t_fields`) + Bitrix (`userfieldconfig.list` для `CRM_<smartTypeId>`), ' +
            'смердженные по `fieldName` ↔ `t_fields.bitrixId`.',
    })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @ApiParam({ name: 'smartName', enum: SmartNameEnum })
    @ApiParam({ name: 'group', enum: SmartGroupEnum })
    @Get('domain/:domain/smartName/:smartName/group/:group')
    async getSmartFieldsByDomain(
        @Param('domain') domain: string,
        @Param('smartName') smartName: SmartNameEnum,
        @Param('group') group: SmartGroupEnum,
    ): Promise<PbxSmartFieldMonitoringResult> {
        return await this.monitoringService.getPbxSmartFieldsByDomain(
            domain,
            smartName,
            group,
        );
    }

    @ApiOperation({
        summary: 'Get smart fields parse data',
        description:
            'Получить распарсенный шаблон смарта из Excel ' +
            '(`install/<group>/smart/<smartName>/data.xlsx`). ' +
            'Возвращает полную модель смарта (поля + категории + стадии); ' +
            'для отдельной проверки только полей используйте ' +
            '`smart[0].fields` из ответа.',
    })
    @ApiParam({ name: 'smartName', enum: SmartNameEnum })
    @ApiParam({ name: 'group', enum: SmartGroupEnum })
    @Get('parse/:smartName/:group')
    async parseSmartFields(
        @Param('smartName') smartName: SmartNameEnum,
        @Param('group') group: SmartGroupEnum,
    ): Promise<Smart[]> {
        return await this.parseSmartService.getParsedData(smartName, group);
    }

    @ApiOperation({
        summary: 'Search smart field by substring',
        description:
            'Поиск поля смарта по подстроке в `code`/`name`/`bxFieldName` шаблона. ' +
            'Для каждого совпадения подкладывается срез из портальной БД и Bitrix.',
    })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @ApiParam({ name: 'smartName', enum: SmartNameEnum })
    @ApiParam({ name: 'group', enum: SmartGroupEnum })
    @ApiParam({ name: 'search', description: 'Подстрока для поиска' })
    @Get('search/:domain/:smartName/:group/:search')
    async searchSmartField(
        @Param('domain') domain: string,
        @Param('smartName') smartName: SmartNameEnum,
        @Param('group') group: SmartGroupEnum,
        @Param('search') search: string,
    ): Promise<PbxSmartFieldSearchResultResponse> {
        return await this.searchService.search(
            domain,
            smartName,
            group,
            search,
        );
    }
}
