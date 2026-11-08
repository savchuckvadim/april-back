import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    ParseIntPipe,
    Post,
    Put,
} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { AuthUser, CurrentUser, Role, Roles } from '@lib/auth';
import {
    LocalAppConnectionService,
    LocalAppPortalRef,
} from '@lib/marketplace-core';
import { CabinetAccessService } from '../access/cabinet-access.service';
import { portalRefOf } from '../controllers/cabinet-portal-ref.util';
import {
    BitrixAppCheckDto,
    BitrixAppConnectionDto,
    SaveBitrixAppKeysDto,
    toBitrixAppConnectionDto,
} from '../dto/cabinet-bitrix-app.dto';

const PORTAL_PARAM = {
    name: 'portalId',
    description: 'ID портала.',
    example: 12,
};

/**
 * «Подключение Битрикс24» в админке April: то же, что видит владелец, плюс
 * ответ Битрикса при ошибке обновления токена. April вносит ключи за
 * клиента, если тот передал их сам.
 */
@ApiTags('Admin: кабинет клиента')
@ApiBearerAuth()
@Roles(Role.SUPER_USER)
@Controller('admin/cabinet/portals/:portalId/bitrix-app')
export class CabinetBitrixAppAdminController {
    constructor(
        private readonly access: CabinetAccessService,
        private readonly connection: LocalAppConnectionService,
    ) {}

    @Get()
    @ApiOperation({
        summary: 'Подключение Битрикс24 портала',
        description:
            'Адреса и права для локального приложения, ключи, установка, последнее обновление токена (с ответом Битрикса при ошибке).',
    })
    @ApiParam(PORTAL_PARAM)
    @ApiOkResponse({ type: BitrixAppConnectionDto, description: 'Состояние.' })
    async status(
        @CurrentUser() user: AuthUser,
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<BitrixAppConnectionDto> {
        return toBitrixAppConnectionDto(
            await this.connection.status(await this.portal(user, portalId)),
            { withErrors: true },
        );
    }

    @Put('keys')
    @ApiOperation({
        summary: 'Внести ключи приложения за клиента',
        description:
            'Пишутся под домен и (если портал уже установлен) под member_id — новые ключи сразу заменяют старые.',
    })
    @ApiParam(PORTAL_PARAM)
    @ApiBody({ type: SaveBitrixAppKeysDto, description: 'Ключи приложения.' })
    @ApiOkResponse({
        type: BitrixAppConnectionDto,
        description: 'Состояние после сохранения.',
    })
    @ApiBadRequestResponse({
        description: 'Ключи не похожи на ключи локального приложения.',
    })
    async saveKeys(
        @CurrentUser() user: AuthUser,
        @Param('portalId', ParseIntPipe) portalId: number,
        @Body() dto: SaveBitrixAppKeysDto,
    ): Promise<BitrixAppConnectionDto> {
        return toBitrixAppConnectionDto(
            await this.connection.saveKeys(
                await this.portal(user, portalId),
                dto,
            ),
            { withErrors: true },
        );
    }

    @Post('check')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Проверить ключи',
        description:
            'Пробное обновление токена: подходят ли ключи к приложению, установленному на портале.',
    })
    @ApiParam(PORTAL_PARAM)
    @ApiOkResponse({ type: BitrixAppCheckDto, description: 'Итог проверки.' })
    async check(
        @CurrentUser() user: AuthUser,
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<BitrixAppCheckDto> {
        return this.connection.check(await this.portal(user, portalId));
    }

    private async portal(
        user: AuthUser,
        portalId: number,
    ): Promise<LocalAppPortalRef> {
        return portalRefOf(await this.access.resolve(user, BigInt(portalId)));
    }
}
