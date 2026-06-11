import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
    ApiBody,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';

import { PbxCompanyInstallUseCase } from '../use-cases/pbx-company-install.use-case';
import { InstallCompanyFieldDto } from '../dto/install-company-field.dto';
import { PbxCompanyInstallFieldUseCase } from '../use-cases/pbx-company-install-field.use-case';
import { PbxCompanyFieldManageUseCase } from '../use-cases/pbx-company-field-manage.use-case';
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

@ApiTags('PBX Company Install')
@Controller('pbx-company-install')
export class PbxCompanyInstallController {
    constructor(
        private readonly useCase: PbxCompanyInstallUseCase,
        private readonly fieldseCase: PbxCompanyInstallFieldUseCase,
        private readonly manageUseCase: PbxCompanyFieldManageUseCase,
    ) {}

    @ApiOperation({
        summary: 'Install company fields by portal, group and appName',
        description:
            'Установить "fields" для "Company" по "порталу", "группе" и "appName". ' +
            'Поля читаются из Excel-файла, сохранённого для указанной группы/приложения.',
    })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @ApiParam({ name: 'group', enum: PbxEntityGroupEnum })
    @ApiParam({ name: 'appName', enum: ParseEntityFieldsAppName })
    @Get('/install/domain/:domain/group/:group/appName/:appName')
    async installCompanyFields(
        @Param('domain') domain: string,
        @Param('group') group: PbxEntityGroupEnum,
        @Param('appName') appName: ParseEntityFieldsAppName,
    ): Promise<IEntityFieldsInstallResult> {
        return await this.useCase.installCompanyFields(domain, group, appName);
    }

    @ApiOperation({
        summary: 'Install company fields by provided fields data',
        description:
            'Установить "fields" для "Company" по уже подготовленному массиву полей. ' +
            'В отличие от GET-варианта, не читает Excel — принимает поля напрямую в теле запроса. ' +
            'Удобно для повторной установки/синхронизации и для интеграционных сценариев.',
    })
    @ApiBody({ type: InstallCompanyFieldDto })
    @ApiResponse({
        status: 201,
        description:
            'Поля успешно отправлены в Bitrix и засинхронизированы с БД April. ' +
            'Возвращает результат установки в Bitrix (`bxResult`) и синхронизации с БД (`portalFieldEntityInstallResult`).',
    })
    @Post('/install-fields/')
    async installCompanyFieldsByFieldsData(
        @Body() dto: InstallCompanyFieldDto,
    ): Promise<IEntityFieldsInstallResult> {
        return await this.fieldseCase.installCompanyFields(dto);
    }

    @ApiOperation({
        summary: 'Delete company fields by codes',
        description:
            'Удаляет указанные поля Company из PortalDB и Bitrix. ' +
            'В Bitrix используется batch (userfield.delete), для enumeration list-items ' +
            'удаляются автоматически вместе с полем. В PortalDB удаление выполняется в транзакции. ' +
            'Поддерживает `domain: "all"` — операция выполняется для всех порталов.',
    })
    @ApiBody({ type: DeleteEntityFieldsDto })
    @Post('/delete-fields/')
    async deleteCompanyFields(
        @Body() dto: DeleteEntityFieldsDto,
    ): Promise<PerPortalFieldDeleteResult[]> {
        return await this.manageUseCase.deleteFields(dto);
    }

    @ApiOperation({
        summary: 'Delete a single enumeration item of a company field',
        description:
            'Удаляет один элемент list-а enumeration-поля Company в PortalDB и Bitrix. ' +
            'Идентификация item-а: code в PortalDB, в Bitrix — сначала по `VALUE` (взятому из имени в БД), ' +
            'затем fallback по `XML_ID`. Поддерживает `domain: "all"`.',
    })
    @ApiBody({ type: DeleteEntityFieldItemDto })
    @Post('/delete-field-item/')
    async deleteCompanyFieldItem(
        @Body() dto: DeleteEntityFieldItemDto,
    ): Promise<PerPortalFieldItemResult[]> {
        return await this.manageUseCase.deleteFieldItem(dto);
    }

    @ApiOperation({
        summary: 'Edit a single enumeration item of a company field',
        description:
            'Обновляет VALUE / name одного элемента list-а enumeration-поля Company в PortalDB и Bitrix. ' +
            'Code item-а остаётся прежним. Item ищется по старому name (VALUE в Bitrix), ' +
            'затем fallback по code (XML_ID). Поддерживает `domain: "all"`.',
    })
    @ApiBody({ type: EditEntityFieldItemDto })
    @Post('/edit-field-item/')
    async editCompanyFieldItem(
        @Body() dto: EditEntityFieldItemDto,
    ): Promise<PerPortalFieldItemResult[]> {
        return await this.manageUseCase.editFieldItem(dto);
    }
}
