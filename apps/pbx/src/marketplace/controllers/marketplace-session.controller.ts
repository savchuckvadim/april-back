import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    NotFoundException,
    Post,
} from '@nestjs/common';
import {
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { MarketplaceSessionService } from '../services/marketplace-session.service';
import {
    ExchangeSessionCodeDto,
    PortalSessionDto,
} from '../dto/marketplace-session.dto';

/**
 * Сессия кабинета: обмен одноразового кода (из query redirect-а роутера)
 * на portal-context JWT. Код живёт 60 секунд и сжигается при обмене —
 * сам токен в URL никогда не попадает; фронт держит его в памяти и ходит
 * Bearer-ом (без cookies → нет проблем SameSite/CHIPS в iframe).
 */
@ApiTags('Bitrix Marketplace Session')
@Controller('bitrix-marketplace/session')
export class MarketplaceSessionController {
    constructor(private readonly sessionService: MarketplaceSessionService) {}

    @ApiOperation({
        summary:
            'Обменять одноразовый код сессии на portal-context JWT (код сжигается)',
    })
    @ApiOkResponse({
        description: 'Сессия портала: токен, состояние допуска, пользователь',
        type: PortalSessionDto,
    })
    @ApiNotFoundResponse({
        description: 'Код не найден, истёк (60с) или уже использован',
    })
    @HttpCode(HttpStatus.OK)
    @Post('exchange')
    async exchange(
        @Body() dto: ExchangeSessionCodeDto,
    ): Promise<PortalSessionDto> {
        const session = await this.sessionService.exchangeCode(dto.code);
        if (!session) {
            throw new NotFoundException(
                'Код сессии не найден, истёк или уже использован — переоткройте приложение из Битрикс24',
            );
        }
        return session;
    }
}
