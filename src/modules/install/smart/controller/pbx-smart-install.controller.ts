import { Controller, Delete, Get, Param, Query } from '@nestjs/common';

import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { SmartGroupEnum, SmartNameEnum } from '../dto/install-smart.dto';
import { DeletePbxSmartUseCase } from '../use-cases/delete-pbx-smart.use-case';
import { GetPbxSmartUseCase } from '../use-cases/get-pbx-smart.use-case';
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
    @Get('domain/:domain/smart/:smartName')
    async getSmartByPortalAndName(
        @Param('domain') domain: string,
        @Param('smartName') smartName: SmartNameEnum,
    ): Promise<any> {
        const getPbxSmartDto = {
            domain,
            smartName,
            withBitrix: true,
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
    ): Promise<any> {
        return await this.installSmartUseCase.execute({
            domain,
            smartName,
            group,
        });
    }

    @ApiOperation({ summary: 'Delete Installed smart' })
    @ApiParam({ name: 'smartName', enum: SmartNameEnum })
    // @ApiParam({ name: 'smartGroup', enum: SmartGroupEnum })
    @ApiParam({ name: 'withBitrix', description: 'If true, delete in bitrix' })
    @Delete('install/domain/:domain/smart/:smartName/:smartGroup')
    async deleteSmart(
        @Param('domain') domain: string,
        @Param('smartName') smartName: SmartNameEnum,
        // @Param('smartGroup') smartGroup: SmartGroupEnum,
        @Query('withBitrix') withBitrix: boolean = false,
    ): Promise<any> {
        return await this.deletePbxSmartUseCase.execute(
            smartName,
            domain,
            undefined,
            withBitrix,
        );
    }

    // @ApiOperation({ summary: 'Install smart' })
    // @ApiParam({ name: 'id', description: 'ID of the item' })
    // @ApiParam({ name: 'entityTypeId', description: 'Entity type ID' })
    // @ApiParam({ name: 'domain', enum: ['april-garant.bitrix24.ru', 'https://pbx.ru'], description: 'Domain of the portal' })
    // @Get('test/item/:id/:entityTypeId/:domain')
    // async testItem(@Param('id') id: number, @Param('entityTypeId') entityTypeId: string, @Param('domain') domain: string): Promise<any> {
    //     return await this.installSmartService.testItem(id, entityTypeId, domain);
    // }
}
