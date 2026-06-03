import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Smart } from '../type/parse.type';
import { SmartGroupEnum, SmartNameEnum } from '../dto/install-smart.dto';
import { ParseSmartService } from '../services/parse/parse-smart.service';

@ApiTags('PBX Smart Parse Template')
@Controller('pbx-smart-parse-template')
export class PbxSmartParseTemplateController {
    constructor(private readonly parseSmartService: ParseSmartService) {}

    @ApiOperation({
        summary: 'Parse smart from Excel',
        description:
            'Получить распарсенный шаблон смарта из Excel ' +
            '(`install/<group>/smart/<smartName>/data.xlsx`).',
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
}
