import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { PbxUserBitrixUseCase } from '../use-cases/pbx-user-bitrix.use-case';
import {
    BxUserFieldsDeleteResponseDto,
    BxUserFieldsInstallResponseDto,
    BxUserFieldsListResponseDto,
    DeleteBxUserFieldsDto,
} from '../dto/pbx-user-bitrix.dto';

/**
 * Управление пользовательскими полями (UF_USR_*) **только в живом Bitrix**.
 *
 * PortalDB не затрагивается. Например: доустановить поле в портал клиента, не
 * записывая его в PortalDB. Комбинированный режим (Bitrix + PortalDB) — в
 * контроллере pbx-user-install.
 */
@ApiTags('PBX User Bitrix (live)')
@Controller('pbx-user-bitrix')
export class PbxUserBitrixController {
    constructor(private readonly useCase: PbxUserBitrixUseCase) {}

    @ApiOperation({
        summary: 'Живые пользовательские поля Bitrix портала (UF_USR_*)',
        description:
            'Читает определения пользовательских полей напрямую из Bitrix ' +
            '(user.userfield.list) и отдаёт только поля с префиксом UF_USR_.',
    })
    @ApiParam({
        name: 'domain',
        description: 'Домен портала (april-dev.bitrix24.ru).',
        example: 'april-dev.bitrix24.ru',
    })
    @ApiOkResponse({ type: BxUserFieldsListResponseDto })
    @Get('domain/:domain/fields')
    async listFields(
        @Param('domain') domain: string,
    ): Promise<BxUserFieldsListResponseDto> {
        return this.useCase.listFields(domain);
    }

    @ApiOperation({
        summary: 'Установить поля пользователя из шаблона только в Bitrix',
        description:
            'Устанавливает/обновляет поля из констант (USER_FIELDS) напрямую в ' +
            'Bitrix через user.userfield.*. PortalDB НЕ обновляется — это ' +
            'отличие от combined-эндпоинта pbx-user-install.',
    })
    @ApiParam({
        name: 'domain',
        description: 'Домен портала (april-dev.bitrix24.ru).',
        example: 'april-dev.bitrix24.ru',
    })
    @ApiOkResponse({ type: BxUserFieldsInstallResponseDto })
    @HttpCode(200)
    @Post('domain/:domain/fields/install')
    async installFields(
        @Param('domain') domain: string,
    ): Promise<BxUserFieldsInstallResponseDto> {
        return this.useCase.installFields(domain);
    }

    @ApiOperation({
        summary: 'Удалить поля пользователя только в Bitrix',
        description:
            'Удаляет указанные по code поля пользователя напрямую в Bitrix ' +
            '(user.userfield.delete, batch). PortalDB НЕ затрагивается.',
    })
    @ApiParam({
        name: 'domain',
        description: 'Домен портала (april-dev.bitrix24.ru).',
        example: 'april-dev.bitrix24.ru',
    })
    @ApiBody({ type: DeleteBxUserFieldsDto })
    @ApiOkResponse({ type: BxUserFieldsDeleteResponseDto })
    @HttpCode(200)
    @Post('domain/:domain/fields/delete')
    async deleteFields(
        @Param('domain') domain: string,
        @Body() dto: DeleteBxUserFieldsDto,
    ): Promise<BxUserFieldsDeleteResponseDto> {
        return this.useCase.deleteFields(domain, dto.codes);
    }
}
