import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { List, ListFolderEnum, ListGroupEnum } from '../type/parse.type';
import { ParseListService } from '../services/parse/parse-list.service';

@ApiTags('PBX List Parse Template')
@Controller('pbx-list-parse-template')
export class PbxListParseTemplateController {
    constructor(private readonly parseListService: ParseListService) {}

    @ApiOperation({
        summary: 'Parse list from Excel',
        description:
            'Получить распарсенный шаблон списка из Excel ' +
            '(`install/<group>/<ListFolderEnum>/data.xlsx`).',
    })
    @ApiParam({ name: 'listName', enum: ListFolderEnum })
    @ApiParam({ name: 'group', enum: ListGroupEnum })
    @Get('parse/:listName/:group')
    async parseList(
        @Param('listName') listName: ListFolderEnum,
        @Param('group') group: ListGroupEnum,
    ): Promise<List[]> {
        return await this.parseListService.getParsedData(listName, group);
    }
}
