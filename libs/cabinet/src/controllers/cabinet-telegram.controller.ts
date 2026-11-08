import {
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Post,
} from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { CabinetAccess, CabinetCtx } from '../access/cabinet-access.decorator';
import { CabinetContext } from '../domain/cabinet-context';
import { CabinetTelegramLinkService } from '../telegram/cabinet-telegram-link.service';
import {
    CabinetTelegramBindingDto,
    CabinetTelegramCodeDto,
} from '../dto/cabinet-telegram.dto';
import { CabinetOkDto } from '../dto/cabinet-auth.dto';

const PORTAL_PARAM = {
    name: 'portalId',
    description: 'ID портала.',
    example: 12,
};

/**
 * Привязка Telegram к сотруднику портала: код из кабинета → `/start КОД`
 * боту April. Доступно и из фрейма (без учётки), и с сайта.
 */
@ApiTags('Кабинет клиента: Telegram')
@Controller('cabinet/portals/:portalId/telegram')
export class CabinetTelegramController {
    constructor(private readonly links: CabinetTelegramLinkService) {}

    @Post('link-code')
    @HttpCode(200)
    @CabinetAccess('frame')
    @ApiOperation({
        summary: 'Получить код привязки Telegram',
        description:
            'Одноразовый код на 10 минут и ссылка, открывающая бота с этим кодом. Привязывается текущий сотрудник портала.',
    })
    @ApiParam(PORTAL_PARAM)
    @ApiOkResponse({ type: CabinetTelegramCodeDto, description: 'Код.' })
    async linkCode(
        @CabinetCtx() ctx: CabinetContext,
    ): Promise<CabinetTelegramCodeDto> {
        return this.links.issueCode(ctx);
    }

    @Get('bindings')
    @CabinetAccess('frame')
    @ApiOperation({
        summary: 'Привязки Telegram',
        description: 'Владелец видит все привязки портала, остальные — свои.',
    })
    @ApiParam(PORTAL_PARAM)
    @ApiOkResponse({
        type: [CabinetTelegramBindingDto],
        description: 'Привязки.',
    })
    async list(
        @CabinetCtx() ctx: CabinetContext,
    ): Promise<CabinetTelegramBindingDto[]> {
        return this.links.list(ctx);
    }

    @Delete('bindings/:bindingId')
    @CabinetAccess('frame')
    @ApiOperation({
        summary: 'Отвязать Telegram',
        description: 'Свою привязку — любой, чужую — только владелец.',
    })
    @ApiParam(PORTAL_PARAM)
    @ApiParam({
        name: 'bindingId',
        description: 'ID привязки.',
        example: '0b8f7c1e-6d4a-4f2b-8e9c-1a2b3c4d5e6f',
    })
    @ApiOkResponse({ type: CabinetOkDto, description: 'Отвязано.' })
    async revoke(
        @CabinetCtx() ctx: CabinetContext,
        @Param('bindingId', ParseUUIDPipe) bindingId: string,
    ): Promise<CabinetOkDto> {
        await this.links.revoke(ctx, bindingId);
        return { ok: true };
    }
}
