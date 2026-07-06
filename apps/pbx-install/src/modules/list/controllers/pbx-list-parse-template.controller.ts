import { Controller, Get, Param } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { List, ListFolderEnum, ListGroupEnum } from '../type/parse.type';
import { ParseListService } from '../services/parse/parse-list.service';
import { ListTemplateDto } from '../dto/list-response.dto';

@ApiTags('PBX List Parse Template')
@Controller('pbx-list-parse-template')
export class PbxListParseTemplateController {
    constructor(private readonly parseListService: ParseListService) {}

    @ApiOperation({
        summary: 'Parse list from Excel',
        description:
            'Получить распарсенный шаблон списка из Excel ' +
            '(`install/<group>/list/<listName>/data.xlsx`). Предпросмотр того, ' +
            'что будет установлено (в одном файле может быть несколько списков).',
    })
    @ApiParam({ name: 'listName', enum: ListFolderEnum })
    @ApiParam({ name: 'group', enum: ListGroupEnum })
    @ApiOkResponse({
        type: [ListTemplateDto],
        description: 'Распарсенные списки шаблона с полями',
    })
    @Get('parse/:listName/:group')
    async parseList(
        @Param('listName') listName: ListFolderEnum,
        @Param('group') group: ListGroupEnum,
    ): Promise<List[]> {
        return await this.parseListService.getParsedData(listName, group);
    }
}
