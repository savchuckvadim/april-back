import { Controller, Get, Param } from '@nestjs/common';

import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PbxCompanyMonitoringService } from '../services/pbx-company-monitoring.service';
import {
    PbxCompanyFieldSearchResultResponse,
    PbxCompanySearchService,
} from '../services/pbx-company-search.service';
import {
    EntityParseData,
    ParseEntityFieldsAppName,
    ParseEntityFieldsService,
    PbxEntityGroupEnum,
} from '../../shared/entity/field/parse-entity-field.service';
import { PbxEntityType } from '@/shared';

@ApiTags('PBX Company Install Monitoring')
@Controller('pbx-company-install-monitoring')
export class PbxCompanyInstallMonitoringController {
    constructor(
        private readonly monitoringService: PbxCompanyMonitoringService,
        private readonly parseService: ParseEntityFieldsService,
        private readonly searchService: PbxCompanySearchService,
    ) {}

    @ApiOperation({
        summary: 'Get company data by domain',
        description:
            'Получить "Company Data" для Портала с всеми "fields" из "Bitrix" и "PortalDB"',
    })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @Get('domain/:domain')
    async getSmartsByDomain(@Param('domain') domain: string) {
        return await this.monitoringService.getPbxCompanyDataByAllPortalFields(
            domain,
        );
    }

    @ApiOperation({
        summary: 'Get company fields parse data',
        description: 'Получить данные для установки "fields" для "Company"',
    })
    @ApiParam({ name: 'appName', enum: ParseEntityFieldsAppName })
    @ApiParam({ name: 'group', enum: PbxEntityGroupEnum })
    @Get('/parse/:appName/:group')
    async getCompanyFieldsParseData(
        @Param('appName') appName: ParseEntityFieldsAppName,
        @Param('group') group: PbxEntityGroupEnum,
    ): Promise<EntityParseData> {
        return await this.parseService.getParsedData(
            PbxEntityType.BTX_COMPANY,
            appName,
            group,
        );
    }

    @ApiOperation({
        summary: 'GeSearcht pbx company field parse data',
        description:
            'Получить "PBXCompany field Data" по имени с всеми "fields" из "Bitrix" и "PortalDB"',
    })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @ApiParam({ name: 'search', description: 'Search string' })
    @ApiParam({ name: 'group', enum: PbxEntityGroupEnum })
    @Get('/search/:domain/:group/:search')
    async getPbxCompanyField(
        @Param('domain') domain: string,
        @Param('group') group: PbxEntityGroupEnum,
        @Param('search') search: string,
    ): Promise<PbxCompanyFieldSearchResultResponse> {
        return await this.searchService.search(domain, group, search);
    }
}
