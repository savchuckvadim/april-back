import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
    ApiBody,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import {
    DeleteTypedEntityFieldItemDto,
    DeleteTypedEntityFieldsDto,
    EditTypedEntityFieldItemDto,
} from '@/modules/pbx-install/shared';
import { SmartGroupEnum, SmartNameEnum } from '../dto/install-smart.dto';
import { InstallSmartFieldDto } from '../dto/install-smart-field.dto';
import { PbxSmartFieldInstallByParseUseCase } from '../use-cases/field/pbx-smart-field-install-by-parse.use-case';
import { PbxSmartFieldInstallByFieldUseCase } from '../use-cases/field/pbx-smart-field-install-by-field.use-case';
import { PbxSmartFieldManageUseCase } from '../use-cases/field/pbx-smart-field-manage.use-case';

@ApiTags('PBX Smart Field Install')
@Controller('pbx-smart-field-install')
export class PbxSmartFieldInstallController {
    constructor(
        private readonly parseUseCase: PbxSmartFieldInstallByParseUseCase,
        private readonly fieldUseCase: PbxSmartFieldInstallByFieldUseCase,
        private readonly manageUseCase: PbxSmartFieldManageUseCase,
    ) { }

    @ApiOperation({
        summary: 'Install smart fields by portal, smartName and group',
        description:
            'Установить "fields" для конкретного "Smart" по "порталу", "smartName" и "группе". ' +
            'Поля читаются из Excel-файла `install/<group>/smart/<smartName>/data.xlsx`. ' +
            'Перед запуском смарт должен уже существовать на портале (`crm.type.add` + `smarts` row).',
    })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @ApiParam({ name: 'smartName', enum: SmartNameEnum })
    @ApiParam({ name: 'group', enum: SmartGroupEnum })
    @Get('/install/domain/:domain/smartName/:smartName/group/:group')
    async installSmartFields(
        @Param('domain') domain: string,
        @Param('smartName') smartName: SmartNameEnum,
        @Param('group') group: SmartGroupEnum,
    ): Promise<unknown> {
        return await this.parseUseCase.installSmartFields(
            domain,
            smartName,
            group,
        );
    }

    @ApiOperation({
        summary: 'Install smart fields by provided fields data',
        description:
            'Установить "fields" для конкретного "Smart" по уже подготовленному массиву полей в body. ' +
            'В отличие от GET-варианта, не читает Excel — принимает поля напрямую.',
    })
    @ApiBody({ type: InstallSmartFieldDto })
    @ApiResponse({
        status: 201,
        description:
            'Поля успешно отправлены в Bitrix через `userfieldconfig.*` и засинхронизированы с БД April. ' +
            'Возвращает результат установки в Bitrix (`bxResult`) и синхронизации с БД ' +
            '(`portalFieldEntityInstallResult`).',
    })
    @Post('/install-fields/')
    async installSmartFieldsByFieldsData(
        @Body() dto: InstallSmartFieldDto,
    ): Promise<unknown> {
        return await this.fieldUseCase.installSmartFields(dto);
    }

    @ApiOperation({
        summary: 'Delete smart fields by codes',
        description:
            'Удаляет указанные поля Smart из PortalDB и Bitrix через `userfieldconfig.delete`. ' +
            'Bitrix вместе с полем удаляет и связанные enum-items. ' +
            'Поддерживает `domain: "all"` — операция повторяется по всем порталам, у которых есть ' +
            'смарт с этим `(smartName, group)`.',
    })
    @ApiBody({ type: DeleteTypedEntityFieldsDto })
    @Post('/delete-fields/')
    async deleteSmartFields(
        @Body() dto: DeleteTypedEntityFieldsDto,
    ): Promise<unknown> {
        return await this.manageUseCase.deleteFields(dto);
    }

    @ApiOperation({
        summary: 'Delete a single enumeration item of a smart field',
        description:
            'Удаляет один элемент list-а enumeration-поля Smart в PortalDB и Bitrix. ' +
            'В Bitrix через `userfieldconfig.update({ field: { enum: [{ id, del: "Y" }] } })`. ' +
            'Поддерживает `domain: "all"`.',
    })
    @ApiBody({ type: DeleteTypedEntityFieldItemDto })
    @Post('/delete-field-item/')
    async deleteSmartFieldItem(
        @Body() dto: DeleteTypedEntityFieldItemDto,
    ): Promise<unknown> {
        return await this.manageUseCase.deleteFieldItem(dto);
    }

    @ApiOperation({
        summary: 'Edit a single enumeration item of a smart field',
        description:
            'Обновляет `value`/`name` одного элемента list-а enumeration-поля Smart в PortalDB и Bitrix. ' +
            'В Bitrix через `userfieldconfig.update({ field: { enum: [{ id, value }] } })`. ' +
            'Поддерживает `domain: "all"`.',
    })
    @ApiBody({ type: EditTypedEntityFieldItemDto })
    @Post('/edit-field-item/')
    async editSmartFieldItem(
        @Body() dto: EditTypedEntityFieldItemDto,
    ): Promise<unknown> {
        return await this.manageUseCase.editFieldItem(dto);
    }
}
