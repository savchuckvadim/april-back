import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Post,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard, Role, Roles, RolesGuard } from '@lib/auth';
import {
    CreateRenewalOfferLinkDto,
    RenewalOfferLinkDto,
    RevokeAllRenewalOfferLinksResponseDto,
} from '../dto/renewal-offer-link.dto';
import { RenewalOfferLinkService } from '../services/renewal-offer-link.service';

/**
 * Управление персональными ссылками на КП: зовётся из админки, её токен
 * проверяется здесь. Глобальных гардов у приложения нет, поэтому защита
 * точечная; общий выключатель — AUTH_ENABLED.
 */
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_USER)
@ApiTags('RenewalOfferLink')
@Controller('renewal-offer/links')
export class RenewalOfferLinkController {
    constructor(private readonly service: RenewalOfferLinkService) {}

    @Get()
    @ApiOperation({
        summary: 'Все ссылки на КП, новые первыми',
        description:
            'В списке и действующие, и отозванные, и истёкшие: видно, какие предложения и с какими ценами выданы.',
    })
    @ApiOkResponse({ type: [RenewalOfferLinkDto] })
    list(): Promise<RenewalOfferLinkDto[]> {
        return this.service.list();
    }

    @Post()
    @HttpCode(200)
    @ApiOperation({
        summary: 'Выдать персональную ссылку клиенту',
        description:
            'Цены сохраняются в строке: клиент не сможет изменить их в адресе. Не указанная цена берётся из прайса.',
    })
    @ApiBody({ type: CreateRenewalOfferLinkDto })
    @ApiOkResponse({ type: RenewalOfferLinkDto })
    create(
        @Body() dto: CreateRenewalOfferLinkDto,
    ): Promise<RenewalOfferLinkDto> {
        return this.service.create(dto);
    }

    // Объявлен до `:id/revoke`, чтобы у маршрутов не было разночтений
    @Post('revoke-all')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Отозвать все действующие ссылки',
        description: 'После отзыва предложения по этим адресам не открываются.',
    })
    @ApiOkResponse({ type: RevokeAllRenewalOfferLinksResponseDto })
    async revokeAll(): Promise<RevokeAllRenewalOfferLinksResponseDto> {
        return { revoked: await this.service.revokeAll() };
    }

    @Post(':id/revoke')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Отозвать одну ссылку',
        description:
            'Повторный отзыв ничего не меняет: дата первого отзыва остаётся.',
    })
    @ApiParam({ name: 'id', description: 'Идентификатор ссылки', type: String })
    @ApiOkResponse({ type: RenewalOfferLinkDto })
    revoke(
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<RenewalOfferLinkDto> {
        return this.service.revoke(id);
    }
}
