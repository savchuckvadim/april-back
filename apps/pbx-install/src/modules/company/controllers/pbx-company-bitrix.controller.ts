import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { PbxCompanyBitrixUseCase } from '../use-cases/pbx-company-bitrix.use-case';
import { DeleteBxFieldsByCodesDto } from '../../shared';
import {
    ParseEntityFieldsAppName,
    PbxEntityGroupEnum,
} from '../../shared/entity/field/parse-entity-field.service';

/**
 * Управление полями компании (UF_CRM_) **только в живом Bitrix**.
 * PortalDB не затрагивается. Комбинированный режим — в pbx-company-install.
 */
@ApiTags('PBX Company Bitrix (live)')
@Controller('pbx-company-bitrix')
export class PbxCompanyBitrixController {
    constructor(private readonly useCase: PbxCompanyBitrixUseCase) {}

    @ApiOperation({
        summary: 'Живые поля компании Bitrix портала (UF_CRM_)',
        description:
            'Читает пользовательские поля компании напрямую из Bitrix ' +
            '(crm.company.userfield.list) и отдаёт только UF_CRM_-поля.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiOkResponse({ description: 'Живые UF_CRM_-поля компании из Bitrix.' })
    @Get('domain/:domain/fields')
    async listFields(@Param('domain') domain: string) {
        return this.useCase.listFields(domain);
    }

    @ApiOperation({
        summary: 'Установить поля компании из Excel-шаблона только в Bitrix',
        description:
            'Устанавливает/обновляет поля компании из Excel напрямую в Bitrix. ' +
            'PortalDB НЕ обновляется — отличие от combined pbx-company-install.',
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
        summary: 'Удалить поля компании только в Bitrix',
        description:
            'Удаляет указанные по code поля компании напрямую в Bitrix ' +
            '(batch). PortalDB НЕ затрагивается.',
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
