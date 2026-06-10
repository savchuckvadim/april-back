import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
    ApiBody,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';

import { PbxUserInstallUseCase } from '../use-cases/pbx-user-install.use-case';
import { PbxUserInstallFieldUseCase } from '../use-cases/pbx-user-install-field.use-case';
import { PbxUserFieldManageUseCase } from '../use-cases/pbx-user-field-manage.use-case';
import { InstallUserFieldDto } from '../dto/install-user-field.dto';
import {
    DeleteEntityFieldItemDto,
    DeleteEntityFieldsDto,
    EditEntityFieldItemDto,
} from '../../shared';

@ApiTags('PBX User Install')
@Controller('pbx-user-install')
export class PbxUserFieldInstallController {
    constructor(
        private readonly useCase: PbxUserInstallUseCase,
        private readonly fieldUseCase: PbxUserInstallFieldUseCase,
        private readonly manageUseCase: PbxUserFieldManageUseCase,
    ) {}

    @ApiOperation({
        summary: 'Install user fields by domain (from constants)',
        description:
            'Установить "fields" для "User" по "домену". Поля берутся из констант ' +
            'приложения (без Excel). Устанавливается/обновляется в Bitrix через ' +
            'user.userfield.* и синхронизируется с PortalDB (сущность USER).',
    })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @Get('/install/domain/:domain')
    async installUserFields(@Param('domain') domain: string): Promise<unknown> {
        return await this.useCase.installUserFields(domain);
    }

    @ApiOperation({
        summary: 'Install user fields by provided fields data',
        description:
            'Установить "fields" для "User" по уже подготовленному массиву полей ' +
            '(в теле запроса). Отправляет поля в Bitrix и синхронизирует с БД April.',
    })
    @ApiBody({ type: InstallUserFieldDto })
    @ApiResponse({
        status: 201,
        description:
            'Поля успешно отправлены в Bitrix и засинхронизированы с БД April. ' +
            'Возвращает `bxResult` и `portalFieldEntityInstallResult`.',
    })
    @Post('/install-fields/')
    async installUserFieldsByFieldsData(
        @Body() dto: InstallUserFieldDto,
    ): Promise<unknown> {
        return await this.fieldUseCase.installUserFields(dto);
    }

    @ApiOperation({
        summary: 'Delete user fields by codes',
        description:
            'Удаляет указанные поля User из PortalDB и Bitrix ' +
            '(user.userfield.delete, batch). Поддерживает `domain: "all"`.',
    })
    @ApiBody({ type: DeleteEntityFieldsDto })
    @Post('/delete-fields/')
    async deleteUserFields(
        @Body() dto: DeleteEntityFieldsDto,
    ): Promise<unknown> {
        return await this.manageUseCase.deleteFields(dto);
    }

    @ApiOperation({
        summary: 'Delete a single enumeration item of a user field',
        description:
            'Удаляет один элемент list-а enumeration-поля User в PortalDB и Bitrix. ' +
            'Item адресуется по `bitrixfield_items.bitrixId` из PortalDB. ' +
            'Поддерживает `domain: "all"`.',
    })
    @ApiBody({ type: DeleteEntityFieldItemDto })
    @Post('/delete-field-item/')
    async deleteUserFieldItem(
        @Body() dto: DeleteEntityFieldItemDto,
    ): Promise<unknown> {
        return await this.manageUseCase.deleteFieldItem(dto);
    }

    @ApiOperation({
        summary: 'Edit a single enumeration item of a user field',
        description:
            'Обновляет VALUE / name одного элемента list-а enumeration-поля User ' +
            'в PortalDB и Bitrix. Code item-а остаётся прежним. Поддерживает `domain: "all"`.',
    })
    @ApiBody({ type: EditEntityFieldItemDto })
    @Post('/edit-field-item/')
    async editUserFieldItem(
        @Body() dto: EditEntityFieldItemDto,
    ): Promise<unknown> {
        return await this.manageUseCase.editFieldItem(dto);
    }
}
