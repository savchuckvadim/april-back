import { Controller, Get, Param } from '@nestjs/common';

import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { EntityParseData, ParseEntityFieldsAppName, ParseEntityFieldsService, PbxEntityGroupEnum } from '../../shared/entity/field/parse-entity-field.service';
import { PbxEntityType } from '@/shared';
import { PbxDealMonitoringService } from '../services/fields/pbx-deal-monitoring.service';
import { PbxDealFieldSearchResultResponse, PbxDealSearchService } from '../services/fields/pbx-deal-search.service';

@ApiTags('PBX Deal Field Install Monitoring')
@Controller('pbx-deal-field-install-monitoring')
export class PbxDealFieldInstallMonitoringController {
    constructor(
        private readonly monitoringService: PbxDealMonitoringService,
        private readonly parseService: ParseEntityFieldsService,
        private readonly searchService: PbxDealSearchService,
    ) { }

    @ApiOperation({
        summary: 'Get deal data by domain',
        description:
            'Получить "Deal Data" для Портала с всеми "fields" из "Bitrix" и "PortalDB"',
    })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @Get('domain/:domain')
    async getSmartsByDomain(@Param('domain') domain: string) {
        return await this.monitoringService.getPbxDealDataByAllPortalFields(
            domain,
        );
    }

    @ApiOperation({
        summary: 'Get deal fields parse data',
        description: 'Получить данные для установки "fields" для "Deal"',
    })
    @ApiParam({ name: 'appName', enum: ParseEntityFieldsAppName })
    @ApiParam({ name: 'group', enum: PbxEntityGroupEnum })
    @Get('/parse/:appName/:group')
    async getDealFieldsParseData(
        @Param('appName') appName: ParseEntityFieldsAppName,
        @Param('group') group: PbxEntityGroupEnum,
    ): Promise<EntityParseData> {
        return await this.parseService.getParsedData(
            PbxEntityType.DEAL,
            appName,
            group
        );
    }

    @ApiOperation({
        summary: 'GeSearcht pbx deal field parse data',
        description:
            'Получить "PBXDeal field Data" по имени с всеми "fields" из "Bitrix" и "PortalDB"',
    })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @ApiParam({ name: 'search', description: 'Search string' })
    @ApiParam({ name: 'group', enum: PbxEntityGroupEnum })
    @Get('/search/:domain/:group/:search')
    async getPbxDealField(
        @Param('domain') domain: string,
        @Param('group') group: PbxEntityGroupEnum,
        @Param('search') search: string,
    ): Promise<PbxDealFieldSearchResultResponse> {
        return await this.searchService.search(domain, group, search);
    }


}
