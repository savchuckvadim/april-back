import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { LocalAppConnectionService } from '@lib/marketplace-core';
import { CabinetAccess, CabinetCtx } from '../access/cabinet-access.decorator';
import { CabinetContext } from '../domain/cabinet-context';
import { portalRefOf } from './cabinet-portal-ref.util';
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
 * «Подключение Битрикс24» для владельца кабинета (с сайта или из фрейма):
 * инструкция по созданию локального приложения, ключи и их проверка.
 */
@ApiTags('Кабинет клиента: подключение Битрикс24')
@Controller('cabinet/portals/:portalId/bitrix-app')
export class CabinetBitrixAppController {
    constructor(private readonly connection: LocalAppConnectionService) {}

    @Get()
    @CabinetAccess('owner')
    @ApiOperation({
        summary: 'Подключение Битрикс24',
        description:
            'Что ввести в Битрикс24 (адреса, права), внесены ли ключи приложения, установлено ли оно и обновляется ли токен.',
    })
    @ApiParam(PORTAL_PARAM)
    @ApiOkResponse({ type: BitrixAppConnectionDto, description: 'Состояние.' })
    async status(
        @CabinetCtx() ctx: CabinetContext,
    ): Promise<BitrixAppConnectionDto> {
        return toBitrixAppConnectionDto(
            await this.connection.status(portalRefOf(ctx)),
            { withErrors: false },
        );
    }

    @Put('keys')
    @CabinetAccess('owner')
    @ApiOperation({
        summary: 'Внести ключи приложения',
        description:
            'client_id и client_secret из карточки локального приложения. Секрет хранится зашифрованным и обратно не показывается.',
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
        @CabinetCtx() ctx: CabinetContext,
        @Body() dto: SaveBitrixAppKeysDto,
    ): Promise<BitrixAppConnectionDto> {
        return toBitrixAppConnectionDto(
            await this.connection.saveKeys(portalRefOf(ctx), dto),
            { withErrors: false },
        );
    }

    @Post('check')
    @HttpCode(200)
    @CabinetAccess('owner')
    @ApiOperation({
        summary: 'Проверить ключи',
        description:
            'Пробное обновление токена: подходят ли ключи к приложению, установленному на портале.',
    })
    @ApiParam(PORTAL_PARAM)
    @ApiOkResponse({ type: BitrixAppCheckDto, description: 'Итог проверки.' })
    check(@CabinetCtx() ctx: CabinetContext): Promise<BitrixAppCheckDto> {
        return this.connection.check(portalRefOf(ctx));
    }
}
