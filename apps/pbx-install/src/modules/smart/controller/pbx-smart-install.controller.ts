import { Controller, Delete, Get, Param, Query } from '@nestjs/common';

import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SmartGroupEnum, SmartNameEnum } from '../dto/install-smart.dto';
import { DeletePbxSmartUseCase } from '../use-cases/delete-pbx-smart.use-case';
import {
    GetPbxSmartByNameResponseDto,
    GetPbxSmartUseCase,
} from '../use-cases/get-pbx-smart.use-case';
import { InstallSmartUseCase } from '../use-cases/install-smart.use-case';

@ApiTags('PBX Smart Install')
@Controller('pbx-smart-install')
export class PbxSmartInstallController {
    constructor(
        private readonly installSmartUseCase: InstallSmartUseCase,
        private readonly getPbxSmartUseCase: GetPbxSmartUseCase,
        private readonly deletePbxSmartUseCase: DeletePbxSmartUseCase,
    ) {}

    @ApiOperation({
        summary: 'Get smarts by domain',
        description: 'Получить все смарты для Портала',
    })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @Get('domain/:domain')
    async getSmartsByDomain(@Param('domain') domain: string) {
        return await this.getPbxSmartUseCase.getPbxAllSmarts(domain, true);
    }

    @ApiOperation({
        summary: 'Get smart by portal and name',
        description: 'Получить смарт по домену и названию',
    })
    @ApiParam({ name: 'smartName', enum: SmartNameEnum })
    @ApiParam({ name: 'withBitrix', description: 'With bitrix' })
    @Get('domain/:domain/smart/:smartName/withBitrix/:withBitrix')
    async getSmartByPortalAndName(
        @Param('domain') domain: string,
        @Param('smartName') smartName: SmartNameEnum,
        @Param('withBitrix') withBitrix: boolean,
    ): Promise<GetPbxSmartByNameResponseDto> {
        const getPbxSmartDto = {
            domain,
            smartName,
            withBitrix,
        };
        return await this.getPbxSmartUseCase.getPbxSmartByName(getPbxSmartDto);
    }

    @ApiOperation({ summary: 'Install smart' })
    @ApiParam({ name: 'smartName', enum: SmartNameEnum })
    @ApiParam({ name: 'group', enum: SmartGroupEnum })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @Get('install/domain/:domain/smart/:smartName/:group')
    async installSmart(
        @Param('domain') domain: string,
        @Param('smartName') smartName: SmartNameEnum,
        @Param('group') group: SmartGroupEnum,
    ) {
        return await this.installSmartUseCase.execute({
            domain,
            smartName,
            group,
        });
    }

    @ApiOperation({ summary: 'Delete Installed smart' })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @ApiParam({ name: 'smartName', enum: SmartNameEnum })
    @ApiParam({ name: 'smartGroup', enum: SmartGroupEnum })
    @ApiQuery({
        name: 'withBitrix',
        required: false,
        description: 'If true, delete in bitrix',
    })
    @Delete('install/domain/:domain/smart/:smartName/:smartGroup')
    async deleteSmart(
        @Param('domain') domain: string,
        @Param('smartName') smartName: SmartNameEnum,
        @Param('smartGroup') smartGroup: SmartGroupEnum,
        @Query('withBitrix') withBitrix: boolean = false,
    ) {
        return await this.deletePbxSmartUseCase.execute(
            smartName,
            domain,
            smartGroup,
            withBitrix,
        );
    }
}
