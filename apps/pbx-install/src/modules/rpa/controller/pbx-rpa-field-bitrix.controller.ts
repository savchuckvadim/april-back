import { Controller, Get, Param } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { PbxRpaFieldBitrixUseCase } from '../use-cases/field/pbx-rpa-field-bitrix.use-case';
import { RpaGroupEnum, RpaNameEnum } from '../dto/install-rpa.dto';

/**
 * Управление полями RPA **только в живом Bitrix** (userfieldconfig.*).
 * PortalDB не затрагивается. Комбинированный режим — в pbx-rpa-field-install.
 */
@ApiTags('PBX RPA Field Bitrix (live)')
@Controller('pbx-rpa-field-bitrix')
export class PbxRpaFieldBitrixController {
    constructor(private readonly useCase: PbxRpaFieldBitrixUseCase) {}

    @ApiOperation({
        summary: 'Установить поля RPA из Excel-шаблона только в Bitrix',
        description:
            'Устанавливает/обновляет поля RPA из Excel напрямую в Bitrix ' +
            '(userfieldconfig.*). PortalDB НЕ обновляется — отличие от ' +
            'combined pbx-rpa-field-install.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiParam({ name: 'rpaName', enum: RpaNameEnum })
    @ApiParam({ name: 'group', enum: RpaGroupEnum })
    @ApiOkResponse({ description: 'Результат установки полей RPA в Bitrix.' })
    @Get('/install/domain/:domain/rpaName/:rpaName/group/:group')
    async installFields(
        @Param('domain') domain: string,
        @Param('rpaName') rpaName: RpaNameEnum,
        @Param('group') group: RpaGroupEnum,
    ): Promise<unknown> {
        return this.useCase.installFields(domain, rpaName, group);
    }
}
