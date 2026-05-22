// import { Controller } from "@nestjs/common";
// import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";

// @ApiTags('PBX List Parse Template')
// @Controller('pbx-list-parse-template')
// export class PbxListParseTemplateController {
//     constructor(private readonly parseSmartService: ParseSmartService) {}

//     @ApiOperation({
//         summary: 'Parse list from Excel',
//         description:
//             'Получить распарсенный шаблон смарта из Excel ' +
//             '(`install/<group>/list/<listName>/data.xlsx`).',
//     })
//     @ApiParam({ name: 'smartName', enum: SmartNameEnum })
//     @ApiParam({ name: 'group', enum: SmartGroupEnum })
//     @Get('parse/:listCode/:group')
//     async parseSmart(
//         @Param('smartName') smartName: SmartNameEnum,
//         @Param('group') group: SmartGroupEnum,
//     ): Promise<Smart[]> {
//         return await this.parseSmartService.getParsedData(smartName, group);
//     }
// }
