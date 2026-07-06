import { Controller, Delete, Get, Param, Query } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import { ListFolderEnum, ListGroupEnum } from '../type/parse.type';
import { InstallListUseCase } from '../use-cases/install-list.use-case';
import { GetPbxListUseCase } from '../use-cases/get-pbx-list.use-case';
import { DeletePbxListUseCase } from '../use-cases/delete-pbx-list.use-case';
import {
    DeletePbxListResultDto,
    InstallListsResponseDto,
    PortalListDto,
    PortalListsResponseDto,
} from '../dto/list-response.dto';

@ApiTags('PBX List Install')
@Controller('pbx-list-install')
export class PbxListInstallController {
    constructor(
        private readonly installListUseCase: InstallListUseCase,
        private readonly getPbxListUseCase: GetPbxListUseCase,
        private readonly deletePbxListUseCase: DeletePbxListUseCase,
    ) {}

    @ApiOperation({
        summary: 'Get portal lists by domain',
        description:
            'Получить все списки портала: строки `bitrixlists` с полями из PortalDB. ' +
            'Живое состояние Bitrix — в `monitoring/domain/:domain`.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiOkResponse({
        type: PortalListsResponseDto,
        description: 'Списки портала из PortalDB',
    })
    @Get('domain/:domain')
    async getListsByDomain(
        @Param('domain') domain: string,
    ): Promise<PortalListsResponseDto> {
        return await this.getPbxListUseCase.getListsByDomain(domain);
    }

    @ApiOperation({
        summary: 'Get one portal list',
        description:
            'Получить один список портала (строка `bitrixlists` + поля из PortalDB) ' +
            'по ключу type + group.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiParam({ name: 'type', description: 'Тип списка (`bitrixlists.type`)' })
    @ApiParam({ name: 'group', enum: ListGroupEnum })
    @ApiOkResponse({
        type: PortalListDto,
        description: 'Список портала с полями из PortalDB',
    })
    @Get('domain/:domain/list/:type/group/:group')
    async getListByKeys(
        @Param('domain') domain: string,
        @Param('type') type: string,
        @Param('group') group: ListGroupEnum,
    ): Promise<PortalListDto> {
        return await this.getPbxListUseCase.getListByDomainAndKeys(
            domain,
            type,
            group,
        );
    }

    @ApiOperation({
        summary: 'Install all list templates',
        description:
            'Установить весь эталон списков: все списки всех существующих ' +
            'Excel-шаблонов (перебор folder × group). Идемпотентно: инфоблоки и ' +
            'поля обновляются, дубликаты не создаются.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiOkResponse({
        type: InstallListsResponseDto,
        description: 'Результаты установки по каждому списку эталона',
    })
    @Get('install/domain/:domain')
    async installAll(
        @Param('domain') domain: string,
    ): Promise<InstallListsResponseDto> {
        return await this.installListUseCase.executeAll(domain);
    }

    @ApiOperation({
        summary: 'Install list from Excel template',
        description:
            'Установить список целиком по Excel-шаблону ' +
            '(`install/<group>/list/<listName>/data.xlsx`): инфоблок в Bitrix ' +
            '(поиск существующего по кандидатам кода, без дубликатов) + поля ' +
            '(gating по isNeedUpdate) + зеркало в PortalDB (`bitrixlists`, `bitrixfields`). ' +
            'Идемпотентен: повторный вызов обновляет существующее.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiParam({ name: 'listName', enum: ListFolderEnum })
    @ApiParam({ name: 'group', enum: ListGroupEnum })
    @ApiOkResponse({
        type: InstallListsResponseDto,
        description:
            'Результат установки: bitrix (создан/обновлён), portalListId, поля',
    })
    @Get('install/domain/:domain/listName/:listName/group/:group')
    async installList(
        @Param('domain') domain: string,
        @Param('listName') listName: ListFolderEnum,
        @Param('group') group: ListGroupEnum,
    ): Promise<InstallListsResponseDto> {
        return await this.installListUseCase.execute(domain, listName, group);
    }

    @ApiOperation({
        summary: 'Delete portal list',
        description:
            'Удалить список: каскад в PortalDB (поля BITRIX_LIST + строка `bitrixlists`), ' +
            'опционально инфоблок в Bitrix (withBitrix=true — lists.delete по IBLOCK_ID).',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiParam({ name: 'type', description: 'Тип списка (`bitrixlists.type`)' })
    @ApiParam({ name: 'group', enum: ListGroupEnum })
    @ApiQuery({
        name: 'withBitrix',
        required: false,
        description: 'true — удалить также инфоблок в Bitrix',
    })
    @ApiOkResponse({
        type: DeletePbxListResultDto,
        description: 'Результат удаления (Bitrix + PortalDB)',
    })
    @Delete('install/domain/:domain/list/:type/group/:group')
    async deleteList(
        @Param('domain') domain: string,
        @Param('type') type: string,
        @Param('group') group: ListGroupEnum,
        @Query('withBitrix') withBitrix?: string,
    ): Promise<DeletePbxListResultDto> {
        return await this.deletePbxListUseCase.execute(
            domain,
            type,
            group,
            withBitrix === 'true',
        );
    }
}
