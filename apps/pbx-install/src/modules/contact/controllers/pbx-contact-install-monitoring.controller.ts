import { Controller, Get, Param } from '@nestjs/common';

import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PbxContactMonitoringService } from '../services/pbx-contact-monitoring.service';
import {
    PbxContactFieldSearchResultResponse,
    PbxContactSearchService,
} from '../services/pbx-contact-search.service';
import {
    EntityParseData,
    ParseEntityFieldsAppName,
    ParseEntityFieldsService,
    PbxEntityGroupEnum,
} from '../../shared/entity/field/parse-entity-field.service';
import { PbxEntityType } from '@/shared';

@ApiTags('PBX Contact Install Monitoring')
@Controller('pbx-contact-install-monitoring')
export class PbxContactInstallMonitoringController {
    constructor(
        private readonly monitoringService: PbxContactMonitoringService,
        private readonly parseService: ParseEntityFieldsService,
        private readonly searchService: PbxContactSearchService,
    ) {}

    @ApiOperation({
        summary: 'Get contact data by domain',
        description:
            'Получить "Contact Data" для Портала с всеми "fields" из "Bitrix" и "PortalDB"',
    })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @Get('domain/:domain')
    async getSmartsByDomain(@Param('domain') domain: string) {
        return await this.monitoringService.getPbxContactDataByAllPortalFields(
            domain,
        );
    }

    @ApiOperation({
        summary: 'Get contact fields parse data',
        description: 'Получить данные для установки "fields" для "Contact"',
    })
    @ApiParam({ name: 'appName', enum: ParseEntityFieldsAppName })
    @ApiParam({ name: 'group', enum: PbxEntityGroupEnum })
    @Get('/parse/:appName/:group')
    async getContactFieldsParseData(
        @Param('appName') appName: ParseEntityFieldsAppName,
        @Param('group') group: PbxEntityGroupEnum,
    ): Promise<EntityParseData> {
        return await this.parseService.getParsedData(
            PbxEntityType.BTX_CONTACT,
            appName,
            group,
        );
    }

    @ApiOperation({
        summary: 'GeSearcht pbx contact field parse data',
        description:
            'Получить "PBXContact field Data" по имени с всеми "fields" из "Bitrix" и "PortalDB"',
    })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @ApiParam({ name: 'search', description: 'Search string' })
    @ApiParam({ name: 'group', enum: PbxEntityGroupEnum })
    @Get('/search/:domain/:group/:search')
    async getPbxContactField(
        @Param('domain') domain: string,
        @Param('group') group: PbxEntityGroupEnum,
        @Param('search') search: string,
    ): Promise<PbxContactFieldSearchResultResponse> {
        return await this.searchService.search(domain, group, search);
    }
}
