import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RpaGroupEnum, RpaNameEnum } from '../dto/install-rpa.dto';
import { PbxRpaFieldMonitoringService } from '../services/fields/pbx-rpa-field-monitoring.service';
import { PbxRpaFieldSearchService } from '../services/fields/pbx-rpa-field-search.service';

@ApiTags('PBX RPA Field Install Monitoring')
@Controller('pbx-rpa-field-install')
export class PbxRpaFieldInstallMonitoringController {
    constructor(
        private readonly monitoringService: PbxRpaFieldMonitoringService,
        private readonly searchService: PbxRpaFieldSearchService,
    ) {}

    @ApiOperation({
        summary: 'Monitoring: RPA fields by domain',
        description:
            'Смерженное состояние полей RPA: PortalDB (`t_fields`) против Bitrix (`userfieldconfig`).',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiParam({ name: 'rpaName', enum: RpaNameEnum })
    @Get('domain/:domain/rpaName/:rpaName')
    async getByDomain(
        @Param('domain') domain: string,
        @Param('rpaName') rpaName: RpaNameEnum,
    ) {
        return this.monitoringService.getPbxRpaFieldsByDomain(domain, rpaName);
    }

    @ApiOperation({
        summary: 'Search RPA fields',
        description:
            'Поиск полей RPA по подстроке в `name`/`code`/`bxFieldName` шаблона с подложенным состоянием БД/Bitrix.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiParam({ name: 'rpaName', enum: RpaNameEnum })
    @ApiParam({ name: 'group', enum: RpaGroupEnum })
    @ApiParam({ name: 'search', description: 'Поисковая подстрока' })
    @Get('search/:domain/:rpaName/:group/:search')
    async search(
        @Param('domain') domain: string,
        @Param('rpaName') rpaName: RpaNameEnum,
        @Param('group') group: RpaGroupEnum,
        @Param('search') search: string,
    ) {
        return this.searchService.search(domain, rpaName, group, search);
    }
}
