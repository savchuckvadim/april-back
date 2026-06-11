import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
    ApiBody,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';

import { InstallLeadFieldDto } from '../dto/install-lead-field.dto';
import { PbxLeadFieldManageUseCase } from '../use-cases/field/pbx-lead-field-manage.use-case';
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
import { PbxLeadFieldInstallByParseUseCase } from '../use-cases/field/pbx-lead-field-install-by-parse.use-case';
import { PbxLeadFieldInstallByFieldUseCase } from '../use-cases/field/pbx-lead-field-install-by-field.use-case';

@ApiTags('PBX Lead Field Install')
@Controller('pbx-lead-field-install')
export class PbxLeadFieldInstallController {
    constructor(
        private readonly parseUseCase: PbxLeadFieldInstallByParseUseCase,
        private readonly fieldseCase: PbxLeadFieldInstallByFieldUseCase,
        private readonly manageUseCase: PbxLeadFieldManageUseCase,
    ) {}

    @ApiOperation({
        summary: 'Install lead fields by portal, group and appName',
        description:
            'Установить "fields" для "Lead" по "порталу", "группе" и "appName". ' +
            'Поля читаются из Excel-файла, сохранённого для указанной группы/приложения.',
    })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @ApiParam({ name: 'group', enum: PbxEntityGroupEnum })
    @ApiParam({ name: 'appName', enum: ParseEntityFieldsAppName })
    @Get('/install/domain/:domain/group/:group/appName/:appName')
    async installLeadFields(
        @Param('domain') domain: string,
        @Param('group') group: PbxEntityGroupEnum,
        @Param('appName') appName: ParseEntityFieldsAppName,
    ): Promise<IEntityFieldsInstallResult> {
        return await this.parseUseCase.installLeadFields(
            domain,
            group,
            appName,
        );
    }

    @ApiOperation({
        summary: 'Install lead fields by provided fields data',
        description:
            'Установить "fields" для "Lead" по уже подготовленному массиву полей. ' +
            'В отличие от GET-варианта, не читает Excel — принимает поля напрямую в теле запроса. ' +
            'Удобно для повторной установки/синхронизации и для интеграционных сценариев.',
    })
    @ApiBody({ type: InstallLeadFieldDto })
    @ApiResponse({
        status: 201,
        description:
            'Поля успешно отправлены в Bitrix и засинхронизированы с БД April. ' +
            'Возвращает результат установки в Bitrix (`bxResult`) и синхронизации с БД (`portalFieldEntityInstallResult`).',
    })
    @Post('/install-fields/')
    async installLeadFieldsByFieldsData(
        @Body() dto: InstallLeadFieldDto,
    ): Promise<IEntityFieldsInstallResult> {
        return await this.fieldseCase.installLeadFields(dto);
    }

    @ApiOperation({
        summary: 'Delete lead fields by codes',
        description:
            'Удаляет указанные поля Lead из PortalDB и Bitrix. ' +
            'В Bitrix используется batch (userfield.delete), для enumeration list-items ' +
            'удаляются автоматически вместе с полем. В PortalDB удаление выполняется в транзакции. ' +
            'Поддерживает `domain: "all"` — операция выполняется для всех порталов.',
    })
    @ApiBody({ type: DeleteEntityFieldsDto })
    @Post('/delete-fields/')
    async deleteLeadFields(
        @Body() dto: DeleteEntityFieldsDto,
    ): Promise<PerPortalFieldDeleteResult[]> {
        return await this.manageUseCase.deleteFields(dto);
    }

    @ApiOperation({
        summary: 'Delete a single enumeration item of a lead field',
        description:
            'Удаляет один элемент list-а enumeration-поля Lead в PortalDB и Bitrix. ' +
            'Идентификация item-а: code в PortalDB, в Bitrix — по `bitrixId` из PortalDB. ' +
            'Поддерживает `domain: "all"`.',
    })
    @ApiBody({ type: DeleteEntityFieldItemDto })
    @Post('/delete-field-item/')
    async deleteLeadFieldItem(
        @Body() dto: DeleteEntityFieldItemDto,
    ): Promise<PerPortalFieldItemResult[]> {
        return await this.manageUseCase.deleteFieldItem(dto);
    }

    @ApiOperation({
        summary: 'Edit a single enumeration item of a lead field',
        description:
            'Обновляет VALUE / name одного элемента list-а enumeration-поля Lead в PortalDB и Bitrix. ' +
            'Code item-а остаётся прежним. Поддерживает `domain: "all"`.',
    })
    @ApiBody({ type: EditEntityFieldItemDto })
    @Post('/edit-field-item/')
    async editLeadFieldItem(
        @Body() dto: EditEntityFieldItemDto,
    ): Promise<PerPortalFieldItemResult[]> {
        return await this.manageUseCase.editFieldItem(dto);
    }
}
