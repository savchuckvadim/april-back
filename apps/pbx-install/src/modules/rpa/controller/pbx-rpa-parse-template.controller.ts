import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RpaGroupEnum, RpaNameEnum } from '../dto/install-rpa.dto';
import { ParseRpaService } from '../services/parse/parse-rpa.service';

@ApiTags('PBX RPA Parse Template')
@Controller('pbx-rpa-parse-template')
export class PbxRpaParseTemplateController {
    constructor(private readonly parseRpaService: ParseRpaService) {}

    @ApiOperation({
        summary: 'Parse RPA Excel template',
        description:
            'Предпросмотр Excel-шаблона RPA (`install/<group>/rpa/<rpaName>/data.xlsx`): ' +
            'категория, стадии и поля без записи в Bitrix/PortalDB.',
    })
    @ApiParam({ name: 'rpaName', enum: RpaNameEnum })
    @ApiParam({ name: 'group', enum: RpaGroupEnum })
    @Get('parse/:rpaName/:group')
    async parse(
        @Param('rpaName') rpaName: RpaNameEnum,
        @Param('group') group: RpaGroupEnum,
    ) {
        return this.parseRpaService.getParsedData(rpaName, group);
    }
}
