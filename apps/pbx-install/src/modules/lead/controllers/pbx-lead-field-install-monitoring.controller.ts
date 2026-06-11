import { Controller, Get, Param } from '@nestjs/common';

import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import {
    EntityParseData,
    ParseEntityFieldsAppName,
    ParseEntityFieldsService,
    PbxEntityGroupEnum,
} from '../../shared/entity/field/parse-entity-field.service';
import { PbxEntityType } from '@/shared';
import { PbxLeadMonitoringService } from '../services/fields/pbx-lead-monitoring.service';
import {
    PbxLeadFieldSearchResultResponse,
    PbxLeadSearchService,
} from '../services/fields/pbx-lead-search.service';

@ApiTags('PBX Lead Field Install Monitoring')
@Controller('pbx-lead-field-install-monitoring')
export class PbxLeadFieldInstallMonitoringController {
    constructor(
        private readonly monitoringService: PbxLeadMonitoringService,
        private readonly parseService: ParseEntityFieldsService,
        private readonly searchService: PbxLeadSearchService,
    ) {}

    @ApiOperation({
        summary: 'Get lead data by domain',
        description:
            'Получить "Lead Data" для Портала с всеми "fields" из "Bitrix" и "PortalDB"',
    })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @Get('domain/:domain')
    async getLeadByDomain(@Param('domain') domain: string) {
        return await this.monitoringService.getPbxLeadDataByAllPortalFields(
            domain,
        );
    }

    @ApiOperation({
        summary: 'Get lead fields parse data',
        description: 'Получить данные для установки "fields" для "Lead"',
    })
    @ApiParam({ name: 'appName', enum: ParseEntityFieldsAppName })
    @ApiParam({ name: 'group', enum: PbxEntityGroupEnum })
    @Get('/parse/:appName/:group')
    async getLeadFieldsParseData(
        @Param('appName') appName: ParseEntityFieldsAppName,
        @Param('group') group: PbxEntityGroupEnum,
    ): Promise<EntityParseData> {
        return await this.parseService.getParsedData(
            PbxEntityType.LEAD,
            appName,
            group,
        );
    }

    @ApiOperation({
        summary: 'Search pbx lead field parse data',
        description:
            'Получить "PBXLead field Data" по имени с всеми "fields" из "Bitrix" и "PortalDB"',
    })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @ApiParam({ name: 'search', description: 'Search string' })
    @ApiParam({ name: 'group', enum: PbxEntityGroupEnum })
    @Get('/search/:domain/:group/:search')
    async getPbxLeadField(
        @Param('domain') domain: string,
        @Param('group') group: PbxEntityGroupEnum,
        @Param('search') search: string,
    ): Promise<PbxLeadFieldSearchResultResponse> {
        return await this.searchService.search(domain, group, search);
    }
}
