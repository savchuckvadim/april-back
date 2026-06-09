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
} from '@app/pbx-install/shared';
import { RpaGroupEnum, RpaNameEnum } from '../dto/install-rpa.dto';
import { InstallRpaFieldDto } from '../dto/install-rpa-field.dto';
import { PbxRpaFieldInstallByParseUseCase } from '../use-cases/field/pbx-rpa-field-install-by-parse.use-case';
import { PbxRpaFieldInstallByFieldUseCase } from '../use-cases/field/pbx-rpa-field-install-by-field.use-case';
import { PbxRpaFieldManageUseCase } from '../use-cases/field/pbx-rpa-field-manage.use-case';

@ApiTags('PBX RPA Field Install')
@Controller('pbx-rpa-field-install')
export class PbxRpaFieldInstallController {
    constructor(
        private readonly parseUseCase: PbxRpaFieldInstallByParseUseCase,
        private readonly fieldUseCase: PbxRpaFieldInstallByFieldUseCase,
        private readonly manageUseCase: PbxRpaFieldManageUseCase,
    ) {}

    @ApiOperation({
        summary: 'Install RPA fields by portal, rpaName and group',
        description:
            'Установить поля RPA из Excel-шаблона `install/<group>/rpa/<rpaName>/data.xlsx`. ' +
            'RPA должен уже существовать на портале (`rpa.type.add` + строка `btx_rpas`).',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiParam({ name: 'rpaName', enum: RpaNameEnum })
    @ApiParam({ name: 'group', enum: RpaGroupEnum })
    @Get('/install/domain/:domain/rpaName/:rpaName/group/:group')
    async installRpaFields(
        @Param('domain') domain: string,
        @Param('rpaName') rpaName: RpaNameEnum,
        @Param('group') group: RpaGroupEnum,
    ): Promise<unknown> {
        return this.parseUseCase.installRpaFields(domain, rpaName, group);
    }

    @ApiOperation({
        summary: 'Install RPA fields by provided fields data',
        description:
            'Установить поля RPA по готовому массиву полей в теле запроса (без чтения Excel).',
    })
    @ApiBody({ type: InstallRpaFieldDto })
    @ApiResponse({
        status: 201,
        description:
            'Поля отправлены в Bitrix (`userfieldconfig`, `moduleId: rpa`) и засинхронизированы с БД.',
    })
    @Post('/install-fields/')
    async installRpaFieldsByFieldsData(
        @Body() dto: InstallRpaFieldDto,
    ): Promise<unknown> {
        return this.fieldUseCase.installRpaFields(dto);
    }

    @ApiOperation({
        summary: 'Delete RPA fields by codes',
        description:
            'Удаляет поля RPA из PortalDB и Bitrix (`userfieldconfig.delete`). ' +
            'Поле `type` в DTO = `rpaName`. Поддерживает `domain: "all"`.',
    })
    @ApiBody({ type: DeleteTypedEntityFieldsDto })
    @Post('/delete-fields/')
    async deleteRpaFields(
        @Body() dto: DeleteTypedEntityFieldsDto,
    ): Promise<unknown> {
        return this.manageUseCase.deleteFields(dto);
    }

    @ApiOperation({
        summary: 'Delete a single enumeration item of an RPA field',
        description:
            'Удаляет один элемент списка enumeration-поля RPA в PortalDB и Bitrix. ' +
            'Поддерживает `domain: "all"`.',
    })
    @ApiBody({ type: DeleteTypedEntityFieldItemDto })
    @Post('/delete-field-item/')
    async deleteRpaFieldItem(
        @Body() dto: DeleteTypedEntityFieldItemDto,
    ): Promise<unknown> {
        return this.manageUseCase.deleteFieldItem(dto);
    }

    @ApiOperation({
        summary: 'Edit a single enumeration item of an RPA field',
        description:
            'Обновляет `value` одного элемента списка enumeration-поля RPA в PortalDB и Bitrix. ' +
            'Поддерживает `domain: "all"`.',
    })
    @ApiBody({ type: EditTypedEntityFieldItemDto })
    @Post('/edit-field-item/')
    async editRpaFieldItem(
        @Body() dto: EditTypedEntityFieldItemDto,
    ): Promise<unknown> {
        return this.manageUseCase.editFieldItem(dto);
    }
}
