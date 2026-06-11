import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
    ApiBody,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';

import { PbxContactInstallUseCase } from '../use-cases/pbx-contact-install.use-case';
import { InstallContactFieldDto } from '../dto/install-contact-field.dto';
import { PbxContactInstallFieldUseCase } from '../use-cases/pbx-contact-install-field.use-case';
import { PbxContactFieldManageUseCase } from '../use-cases/pbx-contact-field-manage.use-case';
import {
    ParseEntityFieldsAppName,
    PbxEntityGroupEnum,
} from '../../shared/entity/field/parse-entity-field.service';
import {
    DeleteEntityFieldItemDto,
    DeleteEntityFieldsDto,
    EditEntityFieldItemDto,
    IEntityFieldsInstallResult,
    PerPortalFieldDeleteResult,
    PerPortalFieldItemResult,
} from '../../shared';

@ApiTags('PBX Contact Install')
@Controller('pbx-contact-install')
export class PbxContactInstallController {
    constructor(
        private readonly useCase: PbxContactInstallUseCase,
        private readonly fieldseCase: PbxContactInstallFieldUseCase,
        private readonly manageUseCase: PbxContactFieldManageUseCase,
    ) {}

    @ApiOperation({
        summary: 'Install contact fields by portal, group and appName',
        description:
            'Установить "fields" для "Contact" по "порталу", "группе" и "appName". ' +
            'Поля читаются из Excel-файла, сохранённого для указанной группы/приложения.',
    })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @ApiParam({ name: 'group', enum: PbxEntityGroupEnum })
    @ApiParam({ name: 'appName', enum: ParseEntityFieldsAppName })
    @Get('/install/domain/:domain/group/:group/appName/:appName')
    async installContactFields(
        @Param('domain') domain: string,
        @Param('group') group: PbxEntityGroupEnum,
        @Param('appName') appName: ParseEntityFieldsAppName,
    ): Promise<IEntityFieldsInstallResult> {
        return await this.useCase.installContactFields(domain, group, appName);
    }

    @ApiOperation({
        summary: 'Install contact fields by provided fields data',
        description:
            'Установить "fields" для "Contact" по уже подготовленному массиву полей. ' +
            'В отличие от GET-варианта, не читает Excel — принимает поля напрямую в теле запроса. ' +
            'Удобно для повторной установки/синхронизации и для интеграционных сценариев.',
    })
    @ApiBody({ type: InstallContactFieldDto })
    @ApiResponse({
        status: 201,
        description:
            'Поля успешно отправлены в Bitrix и засинхронизированы с БД April. ' +
            'Возвращает результат установки в Bitrix (`bxResult`) и синхронизации с БД (`portalFieldEntityInstallResult`).',
    })
    @Post('/install-fields/')
    async installContactFieldsByFieldsData(
        @Body() dto: InstallContactFieldDto,
    ): Promise<IEntityFieldsInstallResult> {
        return await this.fieldseCase.installContactFields(dto);
    }

    @ApiOperation({
        summary: 'Delete contact fields by codes',
        description:
            'Удаляет указанные поля Contact из PortalDB и Bitrix. ' +
            'В Bitrix используется batch (userfield.delete), для enumeration list-items ' +
            'удаляются автоматически вместе с полем. В PortalDB удаление выполняется в транзакции. ' +
            'Поддерживает `domain: "all"` — операция выполняется для всех порталов.',
    })
    @ApiBody({ type: DeleteEntityFieldsDto })
    @Post('/delete-fields/')
    async deleteContactFields(
        @Body() dto: DeleteEntityFieldsDto,
    ): Promise<PerPortalFieldDeleteResult[]> {
        return await this.manageUseCase.deleteFields(dto);
    }

    @ApiOperation({
        summary: 'Delete a single enumeration item of a contact field',
        description:
            'Удаляет один элемент list-а enumeration-поля Contact в PortalDB и Bitrix. ' +
            'Идентификация item-а: code в PortalDB, в Bitrix — сначала по `VALUE` (взятому из имени в БД), ' +
            'затем fallback по `XML_ID`. Поддерживает `domain: "all"`.',
    })
    @ApiBody({ type: DeleteEntityFieldItemDto })
    @Post('/delete-field-item/')
    async deleteContactFieldItem(
        @Body() dto: DeleteEntityFieldItemDto,
    ): Promise<PerPortalFieldItemResult[]> {
        return await this.manageUseCase.deleteFieldItem(dto);
    }

    @ApiOperation({
        summary: 'Edit a single enumeration item of a contact field',
        description:
            'Обновляет VALUE / name одного элемента list-а enumeration-поля Contact в PortalDB и Bitrix. ' +
            'Code item-а остаётся прежним. Item ищется по старому name (VALUE в Bitrix), ' +
            'затем fallback по code (XML_ID). Поддерживает `domain: "all"`.',
    })
    @ApiBody({ type: EditEntityFieldItemDto })
    @Post('/edit-field-item/')
    async editContactFieldItem(
        @Body() dto: EditEntityFieldItemDto,
    ): Promise<PerPortalFieldItemResult[]> {
        return await this.manageUseCase.editFieldItem(dto);
    }
}
