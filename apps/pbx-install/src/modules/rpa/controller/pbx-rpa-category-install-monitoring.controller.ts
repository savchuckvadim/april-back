import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RpaGroupEnum, RpaNameEnum } from '../dto/install-rpa.dto';
import { PbxRpaCategoryMonitoringService } from '../services/categories/pbx-rpa-category-monitoring.service';
import { PbxRpaCategorySearchService } from '../services/categories/pbx-rpa-category-search.service';

@ApiTags('PBX RPA Category Install Monitoring')
@Controller('pbx-rpa-category-install')
export class PbxRpaCategoryInstallMonitoringController {
    constructor(
        private readonly monitoringService: PbxRpaCategoryMonitoringService,
        private readonly searchService: PbxRpaCategorySearchService,
    ) {}

    @ApiOperation({
        summary: 'Monitoring: RPA category/stages by domain',
        description:
            'Смерженное состояние воронки RPA: PortalDB (`btx_categories`/`btx_stages`) против Bitrix (`rpa.stage.listForType`).',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiParam({ name: 'rpaName', enum: RpaNameEnum })
    @Get('domain/:domain/rpaName/:rpaName')
    async getByDomain(
        @Param('domain') domain: string,
        @Param('rpaName') rpaName: RpaNameEnum,
    ) {
        return this.monitoringService.getPbxRpaCategoryByDomain(
            domain,
            rpaName,
        );
    }

    @ApiOperation({
        summary: 'Search RPA category',
        description:
            'Поиск воронки RPA по подстроке в `code`/`name`/`title` шаблона с подложенным состоянием БД/Bitrix.',
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
