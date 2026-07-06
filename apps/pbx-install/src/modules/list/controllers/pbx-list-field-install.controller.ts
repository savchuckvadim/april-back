import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { ListFolderEnum, ListGroupEnum } from '../type/parse.type';
import { InstallListFieldDto } from '../dto/install-list-field.dto';
import {
    DeleteListFieldItemDto,
    DeleteListFieldsDto,
    EditListFieldItemDto,
} from '../dto/manage-list-field.dto';
import { PbxListFieldInstallByParseUseCase } from '../use-cases/field/pbx-list-field-install-by-parse.use-case';
import { PbxListFieldInstallByFieldUseCase } from '../use-cases/field/pbx-list-field-install-by-field.use-case';
import { PbxListFieldManageUseCase } from '../use-cases/field/pbx-list-field-manage.use-case';
import {
    ListFieldsInstallResultDto,
    PerPortalListFieldDeleteResultDto,
    PerPortalListFieldItemResultDto,
} from '../dto/list-response.dto';

@ApiTags('PBX List Field Install')
@Controller('pbx-list-field-install')
export class PbxListFieldInstallController {
    constructor(
        private readonly byParseUseCase: PbxListFieldInstallByParseUseCase,
        private readonly byFieldUseCase: PbxListFieldInstallByFieldUseCase,
        private readonly manageUseCase: PbxListFieldManageUseCase,
    ) {}

    @ApiOperation({
        summary: 'Install list fields from Excel template',
        description:
            'Установить поля списков по Excel-шаблону ' +
            '(`install/<group>/list/<listName>/data.xlsx`). Требует, чтобы список ' +
            'уже был установлен (строка в `bitrixlists`) — первичную установку ' +
            'делает `pbx-list-install`. Ставятся только поля с isNeedUpdate=true.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiParam({ name: 'listName', enum: ListFolderEnum })
    @ApiParam({ name: 'group', enum: ListGroupEnum })
    @ApiOkResponse({
        type: [ListFieldsInstallResultDto],
        description:
            'Результаты установки полей по каждому списку шаблона (Bitrix + зеркало PortalDB)',
    })
    @Get('install/domain/:domain/listName/:listName/group/:group')
    async installListFields(
        @Param('domain') domain: string,
        @Param('listName') listName: ListFolderEnum,
        @Param('group') group: ListGroupEnum,
    ): Promise<ListFieldsInstallResultDto[]> {
        return await this.byParseUseCase.installListFields(
            domain,
            listName,
            group,
        );
    }

    @ApiOperation({
        summary: 'Install list fields from request body',
        description:
            'Установить поля списка из тела запроса (шаблон не читается). ' +
            'Для повторной установки/синхронизации и интеграций, когда фронт ' +
            'сам формирует payload.',
    })
    @ApiBody({ type: InstallListFieldDto })
    @ApiOkResponse({
        type: ListFieldsInstallResultDto,
        description: 'Результат установки полей (Bitrix + зеркало PortalDB)',
    })
    @Post('install-fields/')
    async installFieldsByBody(
        @Body() dto: InstallListFieldDto,
    ): Promise<ListFieldsInstallResultDto> {
        return await this.byFieldUseCase.installListFields(dto);
    }

    @ApiOperation({
        summary: 'Delete list fields',
        description:
            'Удалить поля списка по code в PortalDB и Bitrix. ' +
            'domain="all" — операция выполняется для всех порталов.',
    })
    @ApiBody({ type: DeleteListFieldsDto })
    @ApiOkResponse({
        type: [PerPortalListFieldDeleteResultDto],
        description: 'Пер-портальные результаты удаления полей',
    })
    @Post('delete-fields/')
    async deleteFields(
        @Body() dto: DeleteListFieldsDto,
    ): Promise<PerPortalListFieldDeleteResultDto[]> {
        return await this.manageUseCase.deleteFields(dto);
    }

    @ApiOperation({
        summary: 'Delete list field enum item',
        description:
            'Удалить один элемент enumeration-поля списка в PortalDB и Bitrix. ' +
            'domain="all" — операция выполняется для всех порталов.',
    })
    @ApiBody({ type: DeleteListFieldItemDto })
    @ApiOkResponse({
        type: [PerPortalListFieldItemResultDto],
        description: 'Пер-портальные результаты удаления элемента',
    })
    @Post('delete-field-item/')
    async deleteFieldItem(
        @Body() dto: DeleteListFieldItemDto,
    ): Promise<PerPortalListFieldItemResultDto[]> {
        return await this.manageUseCase.deleteFieldItem(dto);
    }

    @ApiOperation({
        summary: 'Edit list field enum item',
        description:
            'Переименовать один элемент enumeration-поля списка в PortalDB и Bitrix. ' +
            'domain="all" — операция выполняется для всех порталов.',
    })
    @ApiBody({ type: EditListFieldItemDto })
    @ApiOkResponse({
        type: [PerPortalListFieldItemResultDto],
        description: 'Пер-портальные результаты правки элемента',
    })
    @Post('edit-field-item/')
    async editFieldItem(
        @Body() dto: EditListFieldItemDto,
    ): Promise<PerPortalListFieldItemResultDto[]> {
        return await this.manageUseCase.editFieldItem(dto);
    }
}
