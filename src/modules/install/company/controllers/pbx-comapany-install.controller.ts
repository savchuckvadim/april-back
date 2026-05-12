import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
    CompanyAppName,
    PbxCompanyGroupEnum,
} from '../services/pbx-company-parse.service';
import { PbxCompanyInstallUseCase } from '../use-cases/pbx-company-install.use-case';

@ApiTags('PBX Company Install')
@Controller('pbx-company-install')
export class PbxCompanyInstallController {
    constructor(private readonly useCase: PbxCompanyInstallUseCase) {}

    @ApiOperation({
        summary: 'Install company fields by portal, group and appName',
        description:
            'Установить "fields" для "Company" по "порталу", "группе" и "appName"',
    })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @ApiParam({ name: 'group', enum: PbxCompanyGroupEnum })
    @ApiParam({ name: 'appName', enum: CompanyAppName })
    @Get('/install/domain/:domain/group/:group/appName/:appName')
    async installCompanyFields(
        @Param('domain') domain: string,
        @Param('group') group: PbxCompanyGroupEnum,
        @Param('appName') appName: CompanyAppName,
    ): Promise<any> {
        return await this.useCase.installCompanyFields(domain, group, appName);
    }
}
