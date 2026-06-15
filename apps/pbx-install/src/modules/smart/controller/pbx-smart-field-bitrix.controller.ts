import { Controller, Get, Param } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { PbxSmartFieldBitrixUseCase } from '../use-cases/field/pbx-smart-field-bitrix.use-case';
import { SmartGroupEnum, SmartNameEnum } from '../dto/install-smart.dto';

/**
 * Управление полями смарта **только в живом Bitrix** (userfieldconfig.*).
 * PortalDB не затрагивается. Комбинированный режим — в pbx-smart-field-install.
 */
@ApiTags('PBX Smart Field Bitrix (live)')
@Controller('pbx-smart-field-bitrix')
export class PbxSmartFieldBitrixController {
    constructor(private readonly useCase: PbxSmartFieldBitrixUseCase) {}

    @ApiOperation({
        summary: 'Установить поля смарта из Excel-шаблона только в Bitrix',
        description:
            'Устанавливает/обновляет поля смарта из Excel напрямую в Bitrix ' +
            '(userfieldconfig.*). PortalDB НЕ обновляется — отличие от ' +
            'combined pbx-smart-field-install.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiParam({ name: 'smartName', enum: SmartNameEnum })
    @ApiParam({ name: 'group', enum: SmartGroupEnum })
    @ApiOkResponse({
        description: 'Результат установки полей смарта в Bitrix.',
    })
    @Get('/install/domain/:domain/smartName/:smartName/group/:group')
    async installFields(
        @Param('domain') domain: string,
        @Param('smartName') smartName: SmartNameEnum,
        @Param('group') group: SmartGroupEnum,
    ): Promise<unknown> {
        return this.useCase.installFields(domain, smartName, group);
    }
}
