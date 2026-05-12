import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Smart } from '../type/parse.type';
import { SmartGroupEnum, SmartNameEnum } from '../dto/install-smart.dto';
import { ParseSmartRegistryService } from '../services/parse/parse-registry.service';
import { PbxGroupDefinition } from '@/modules/pbx-registry';
import { ParseSmartService } from '../services/parse/parse-service';

@ApiTags('PBX Smart Parse Template')
@Controller('pbx-smart-parse-template')
export class PbxSmartParseTemplateController {
    constructor(
        private readonly parseSmartRegistryService: ParseSmartRegistryService,
        private readonly parseSmartService: ParseSmartService,
    ) {}

    @ApiOperation({
        summary: 'Parse smart',
        description: 'Взять данные из таблицы Excel и посмотреть',
    })
    @ApiParam({ name: 'smartName', enum: SmartNameEnum })
    @ApiParam({ name: 'group', enum: SmartGroupEnum })
    @Get('parse/:smartName/:group')
    async parseSmart(
        @Param('smartName') smartName: SmartNameEnum,
        @Param('group') group: SmartGroupEnum,
    ): Promise<Smart[]> {
        return await this.parseSmartService.getParsedData(smartName, group);
    }

    @ApiOperation({
        summary: 'Parse smart from json',
        description: 'Взять данные из json и посмотреть RegistryService',
    })
    @ApiParam({ name: 'smartName', enum: SmartNameEnum })
    @ApiParam({ name: 'group', enum: SmartGroupEnum })
    @Get('json/:smartName/:group')
    parseJsonSmart(
        @Param('smartName') smartName: SmartNameEnum,
        @Param('group') group: SmartGroupEnum,
    ): PbxGroupDefinition {
        return this.parseSmartRegistryService.getParsedData(smartName, group);
    }
}
