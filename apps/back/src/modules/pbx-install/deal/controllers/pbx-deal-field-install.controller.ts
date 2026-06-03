import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
    ApiBody,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';

import { InstallDealFieldDto } from '../dto/install-deal-field.dto';
import { PbxDealFieldManageUseCase } from '../use-cases/field/pbx-deal-field-manage.use-case';
import {
    ParseEntityFieldsAppName,
    PbxEntityGroupEnum,
} from '../../shared/entity/field/parse-entity-field.service';
import {
    DeleteEntityFieldItemDto,
    DeleteEntityFieldsDto,
    EditEntityFieldItemDto,
} from '../../shared';
import { PbxDealFieldInstallByParseUseCase } from '../use-cases/field/pbx-deal-field-install-by-parse.use-case';
import { PbxDealFieldInstallByFieldUseCase } from '../use-cases/field/pbx-deal-field-install-by-field.use-case';

@ApiTags('PBX Deal Field Install')
@Controller('pbx-deal-field-install')
export class PbxDealFieldInstallController {
    constructor(
        private readonly parseUseCase: PbxDealFieldInstallByParseUseCase,
        private readonly fieldseCase: PbxDealFieldInstallByFieldUseCase,
        private readonly manageUseCase: PbxDealFieldManageUseCase,
    ) {}

    @ApiOperation({
        summary: 'Install deal fields by portal, group and appName',
        description:
            'Установить "fields" для "Deal" по "порталу", "группе" и "appName". ' +
            'Поля читаются из Excel-файла, сохранённого для указанной группы/приложения.',
    })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @ApiParam({ name: 'group', enum: PbxEntityGroupEnum })
    @ApiParam({ name: 'appName', enum: ParseEntityFieldsAppName })
    @Get('/install/domain/:domain/group/:group/appName/:appName')
    async installDealFields(
        @Param('domain') domain: string,
        @Param('group') group: PbxEntityGroupEnum,
        @Param('appName') appName: ParseEntityFieldsAppName,
    ): Promise<any> {
        return await this.parseUseCase.installDealFields(
            domain,
            group,
            appName,
        );
    }

    @ApiOperation({
        summary: 'Install deal fields by provided fields data',
        description:
            'Установить "fields" для "Deal" по уже подготовленному массиву полей. ' +
            'В отличие от GET-варианта, не читает Excel — принимает поля напрямую в теле запроса. ' +
            'Удобно для повторной установки/синхронизации и для интеграционных сценариев.',
    })
    @ApiBody({ type: InstallDealFieldDto })
    @ApiResponse({
        status: 201,
        description:
            'Поля успешно отправлены в Bitrix и засинхронизированы с БД April. ' +
            'Возвращает результат установки в Bitrix (`bxResult`) и синхронизации с БД (`portalFieldEntityInstallResult`).',
    })
    @Post('/install-fields/')
    async installDealFieldsByFieldsData(
        @Body() dto: InstallDealFieldDto,
    ): Promise<any> {
        return await this.fieldseCase.installDealFields(dto);
    }

    @ApiOperation({
        summary: 'Delete deal fields by codes',
        description:
            'Удаляет указанные поля Deal из PortalDB и Bitrix. ' +
            'В Bitrix используется batch (userfield.delete), для enumeration list-items ' +
            'удаляются автоматически вместе с полем. В PortalDB удаление выполняется в транзакции. ' +
            'Поддерживает `domain: "all"` — операция выполняется для всех порталов.',
    })
    @ApiBody({ type: DeleteEntityFieldsDto })
    @Post('/delete-fields/')
    async deleteDealFields(@Body() dto: DeleteEntityFieldsDto): Promise<any> {
        return await this.manageUseCase.deleteFields(dto);
    }

    @ApiOperation({
        summary: 'Delete a single enumeration item of a deal field',
        description:
            'Удаляет один элемент list-а enumeration-поля Deal в PortalDB и Bitrix. ' +
            'Идентификация item-а: code в PortalDB, в Bitrix — сначала по `VALUE` (взятому из имени в БД), ' +
            'затем fallback по `XML_ID`. Поддерживает `domain: "all"`.',
    })
    @ApiBody({ type: DeleteEntityFieldItemDto })
    @Post('/delete-field-item/')
    async deleteDealFieldItem(
        @Body() dto: DeleteEntityFieldItemDto,
    ): Promise<any> {
        return await this.manageUseCase.deleteFieldItem(dto);
    }

    @ApiOperation({
        summary: 'Edit a single enumeration item of a deal field',
        description:
            'Обновляет VALUE / name одного элемента list-а enumeration-поля Deal в PortalDB и Bitrix. ' +
            'Code item-а остаётся прежним. Item ищется по старому name (VALUE в Bitrix), ' +
            'затем fallback по code (XML_ID). Поддерживает `domain: "all"`.',
    })
    @ApiBody({ type: EditEntityFieldItemDto })
    @Post('/edit-field-item/')
    async editDealFieldItem(@Body() dto: EditEntityFieldItemDto): Promise<any> {
        return await this.manageUseCase.editFieldItem(dto);
    }
}
