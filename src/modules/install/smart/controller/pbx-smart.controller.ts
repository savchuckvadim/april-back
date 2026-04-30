import { Controller, Delete, Get, Param } from '@nestjs/common';

import { PortalSmartService } from '../services/portal-smart.service';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ParseSmartService } from '../services/parse/parse-service';
import { Smart } from '../type/parse.type';
import { SmartGroupEnum, SmartNameEnum } from '../dto/install-smart.dto';
import { PbxInstallSmartService } from '../services/install-to-bx/install.service';
import { DeleteSmartUseCase } from '../use-cases/delete.use-case';
import { ParseSmartRegistryService } from '../services/parse/parse-registry.service';
import { PbxGroupDefinition } from '@/modules/pbx-registry';

@ApiTags('PBX Smart')
@Controller('pbx-smart')
export class PbxSmartController {
    constructor(
        private readonly portalSmartService: PortalSmartService,
        private readonly parseSmartService: ParseSmartService,
        private readonly parseSmartRegistryService: ParseSmartRegistryService,
        private readonly installSmartService: PbxInstallSmartService,
        private readonly deleteSmartUseCase: DeleteSmartUseCase,
    ) {}

    @ApiOperation({ summary: 'Get smarts by domain' })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @Get('domain/:domain')
    async getSmartsByDomain(@Param('domain') domain: string) {
        return await this.portalSmartService.getSmartsByPortalDomain(domain);
    }

    @ApiOperation({ summary: 'Get smart by portal and name' })
    @ApiParam({ name: 'smartName', enum: SmartNameEnum })
    @Get('domain/:domain/smart/:smartName')
    async getSmartByPortalAndName(
        @Param('domain') domain: string,
        @Param('smartName') smartName: SmartNameEnum,
    ): Promise<any> {
        return await this.portalSmartService.getSmartByPortalAndName(
            domain,
            smartName,
        );
    }

    @ApiOperation({ summary: 'Parse smart' })
    @ApiParam({ name: 'smartName', enum: SmartNameEnum })
    @ApiParam({ name: 'group', enum: SmartGroupEnum })
    @Get('parse/:smartName/:group')
    async parseSmart(
        @Param('smartName') smartName: SmartNameEnum,
        @Param('group') group: SmartGroupEnum,
    ): Promise<Smart[]> {
        return await this.parseSmartService.getParsedData(smartName, group);
    }

    @ApiOperation({ summary: 'Parse smart from json' })
    @ApiParam({ name: 'smartName', enum: SmartNameEnum })
    @ApiParam({ name: 'group', enum: SmartGroupEnum })
    @Get('json/:smartName/:group')
    parseJsonSmart(
        @Param('smartName') smartName: SmartNameEnum,
        @Param('group') group: SmartGroupEnum,
    ): PbxGroupDefinition {
        return this.parseSmartRegistryService.getParsedData(smartName, group);
    }

    @ApiOperation({ summary: 'Install smart' })
    @ApiParam({ name: 'smartName', enum: SmartNameEnum })
    @ApiParam({ name: 'group', enum: SmartGroupEnum })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    // @ApiParam({ name: 'domain', enum: ['april-garant.bitrix24.ru', 'https://pbx.ru'], description: 'Domain of the portal' })
    @Get('install/domain/:domain/smart/:smartName/:group')
    async installSmart(
        @Param('domain') domain: string,
        @Param('smartName') smartName: SmartNameEnum,
        @Param('group') group: SmartGroupEnum,
    ): Promise<any> {
        return await this.installSmartService.installSmart({
            domain,
            smartName,
            group,
        });
    }

    @ApiOperation({ summary: 'Delete Installed smart' })
    @ApiParam({ name: 'smartName', enum: SmartNameEnum })
    @ApiParam({ name: 'smartGroup', enum: SmartGroupEnum })
    @Delete('install/domain/:domain/smart/:smartName/:smartGroup')
    async deleteSmart(
        @Param('domain') domain: string,
        @Param('smartName') smartName: SmartNameEnum,
        @Param('smartGroup') smartGroup: SmartGroupEnum,
    ): Promise<any> {
        return await this.deleteSmartUseCase.execute(
            smartName,
            domain,
            smartGroup,
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
