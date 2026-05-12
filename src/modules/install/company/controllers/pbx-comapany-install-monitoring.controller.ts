import { Controller, Get, Param } from '@nestjs/common';

import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PbxCompanyMonitoringService } from '../services/pbx-company-monitoring.service';
import {
    CompanyAppName,
    CompanyParseData,
    ParseCompanyService,
    PbxCompanyGroupEnum,
} from '../services/pbx-company-parse.service';
import {
    PbxCompanyFieldSearchResultResponse,
    PbxCompanySearchService,
} from '../services/pbx-company-search.service';

@ApiTags('PBX Company Install Monitoring')
@Controller('pbx-company-install-monitoring')
export class PbxCompanyInstallMonitoringController {
    constructor(
        private readonly monitoringService: PbxCompanyMonitoringService,
        private readonly parseService: ParseCompanyService,
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
    @ApiParam({ name: 'appName', enum: CompanyAppName })
    @ApiParam({ name: 'group', enum: PbxCompanyGroupEnum })
    @Get('/parse/:appName/:group')
    async getCompanyFieldsParseData(
        @Param('appName') appName: CompanyAppName,
        @Param('group') group: PbxCompanyGroupEnum,
    ): Promise<CompanyParseData> {
        return await this.parseService.getParsedData(appName, group);
    }

    @ApiOperation({
        summary: 'GeSearcht pbx company field parse data',
        description:
            'Получить "PBXCompany field Data" по имени с всеми "fields" из "Bitrix" и "PortalDB"',
    })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @ApiParam({ name: 'search', description: 'Search string' })
    @ApiParam({ name: 'group', enum: PbxCompanyGroupEnum })
    @Get('/search/:domain/:group/:search')
    async getPbxCompanyField(
        @Param('domain') domain: string,
        @Param('group') group: PbxCompanyGroupEnum,
        @Param('search') search: string,
    ): Promise<PbxCompanyFieldSearchResultResponse> {
        return await this.searchService.search(domain, group, search);
    }

    // @ApiOperation({
    //     summary: 'Get smart by portal and name',
    //     description: 'Получить смарт по домену и названию',
    // })
    // @ApiParam({ name: 'smartName', enum: SmartNameEnum })
    // @Get('domain/:domain/smart/:smartName')
    // async getSmartByPortalAndName(
    //     @Param('domain') domain: string,
    //     @Param('smartName') smartName: SmartNameEnum,
    // ): Promise<any> {
    //     const getPbxSmartDto = {
    //         domain,
    //         smartName,
    //         withBitrix: true,
    //     };
    //     return await this.getPbxSmartUseCase.getPbxSmartByName(getPbxSmartDto);
    // }
}
