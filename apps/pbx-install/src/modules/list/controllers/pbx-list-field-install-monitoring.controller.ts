import { Controller, Get, Param } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { ListFolderEnum, ListGroupEnum } from '../type/parse.type';
import { PbxListFieldMonitoringService } from '../services/monitoring/pbx-list-field-monitoring.service';
import { PbxListSearchService } from '../services/monitoring/pbx-list-search.service';

@ApiTags('PBX List Field Install Monitoring')
@Controller('pbx-list-field-install-monitoring')
export class PbxListFieldInstallMonitoringController {
    constructor(
        private readonly monitoringService: PbxListFieldMonitoringService,
        private readonly searchService: PbxListSearchService,
    ) {}

    @ApiOperation({
        summary: 'Get list data for all portals',
        description:
            'Списки всех порталов из PortalDB с полями. Порталы с ошибкой ' +
            'получения данных возвращаются в списке errors.',
    })
    @ApiOkResponse({ description: 'Сводка списков по всем порталам' })
    @Get('all')
    async getAllPortals() {
        return await this.monitoringService.getAllPortals();
    }

    @ApiOperation({
        summary: 'Get merged list fields by domain',
        description:
            'Сводка полей одного списка: PortalDB (`bitrixfields`) против Bitrix ' +
            '(`lists.field.get`), сопоставление по CODE свойства. Возвращает ' +
            'смерженные поля и хвосты с обеих сторон.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiParam({ name: 'type', description: 'Тип списка (`bitrixlists.type`)' })
    @ApiParam({ name: 'group', enum: ListGroupEnum })
    @ApiOkResponse({
        description:
            'mergedFields + portalFieldsWithoutMerged + bitrixFieldsWithoutMerged',
    })
    @Get('domain/:domain/list/:type/group/:group')
    async getListFieldsByDomain(
        @Param('domain') domain: string,
        @Param('type') type: string,
        @Param('group') group: ListGroupEnum,
    ) {
        return await this.monitoringService.getPbxListFieldsByDomain(
            domain,
            type,
            group,
        );
    }

    @ApiOperation({
        summary: 'Search list template fields with portal state',
        description:
            'Поиск по подстроке в code/name/bxFieldName полей Excel-шаблона ' +
            'с подложенным состоянием PortalDB и Bitrix.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiParam({ name: 'listName', enum: ListFolderEnum })
    @ApiParam({ name: 'group', enum: ListGroupEnum })
    @ApiParam({ name: 'search', description: 'Строка поиска' })
    @ApiOkResponse({ description: 'Найденные поля: parse + pbx + bx' })
    @Get('search/:domain/:listName/:group/:search')
    async search(
        @Param('domain') domain: string,
        @Param('listName') listName: ListFolderEnum,
        @Param('group') group: ListGroupEnum,
        @Param('search') search: string,
    ) {
        return await this.searchService.search(domain, listName, group, search);
    }
}
