import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { PbxLeadFieldBitrixUseCase } from '../use-cases/field/pbx-lead-field-bitrix.use-case';
import { DeleteBxFieldsByCodesDto } from '../../shared';
import {
    ParseEntityFieldsAppName,
    PbxEntityGroupEnum,
} from '../../shared/entity/field/parse-entity-field.service';

/**
 * Управление полями лида (UF_CRM_) **только в живом Bitrix**.
 * PortalDB не затрагивается. Комбинированный режим — в pbx-lead-field-install.
 */
@ApiTags('PBX Lead Field Bitrix (live)')
@Controller('pbx-lead-field-bitrix')
export class PbxLeadFieldBitrixController {
    constructor(private readonly useCase: PbxLeadFieldBitrixUseCase) {}

    @ApiOperation({
        summary: 'Живые поля лида Bitrix портала (UF_CRM_)',
        description:
            'Читает пользовательские поля лида напрямую из Bitrix и ' +
            'отдаёт только UF_CRM_-поля.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiOkResponse({ description: 'Живые UF_CRM_-поля лида из Bitrix.' })
    @Get('domain/:domain/fields')
    async listFields(@Param('domain') domain: string) {
        return this.useCase.listFields(domain);
    }

    @ApiOperation({
        summary: 'Установить поля лида из Excel-шаблона только в Bitrix',
        description:
            'Устанавливает/обновляет поля лида из Excel напрямую в Bitrix. ' +
            'PortalDB НЕ обновляется — отличие от combined pbx-lead-field-install.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiParam({ name: 'group', enum: PbxEntityGroupEnum })
    @ApiParam({ name: 'appName', enum: ParseEntityFieldsAppName })
    @ApiOkResponse({ description: 'Результат установки полей в Bitrix.' })
    @HttpCode(200)
    @Post('domain/:domain/group/:group/appName/:appName/fields/install')
    async installFields(
        @Param('domain') domain: string,
        @Param('group') group: PbxEntityGroupEnum,
        @Param('appName') appName: ParseEntityFieldsAppName,
    ) {
        return this.useCase.installFields(domain, group, appName);
    }

    @ApiOperation({
        summary: 'Удалить поля лида только в Bitrix',
        description:
            'Удаляет указанные по code поля лида напрямую в Bitrix (batch). ' +
            'PortalDB НЕ затрагивается.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiBody({ type: DeleteBxFieldsByCodesDto })
    @ApiOkResponse({ description: 'Результат удаления полей в Bitrix.' })
    @HttpCode(200)
    @Post('domain/:domain/fields/delete')
    async deleteFields(
        @Param('domain') domain: string,
        @Body() dto: DeleteBxFieldsByCodesDto,
    ) {
        return this.useCase.deleteFields(domain, dto.codes);
    }
}
