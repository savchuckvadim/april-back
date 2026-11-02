import { Controller, Get, Param } from '@nestjs/common';
import {
    ApiGoneResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { PublicRenewalOfferDto } from '../dto/renewal-offer-link.dto';
import { RenewalOfferLinkService } from '../services/renewal-offer-link.service';

/**
 * Публичная сторона ссылки на КП — без авторизации, доступ только по
 * неугадываемому токену. Зовётся страницей предложения во фронте.
 *
 * Открыта намеренно: клиент не авторизован нигде, а цены защищает то, что
 * они приходят отсюда, а не из адреса. Отозванная, истёкшая и неизвестная
 * ссылки дают 410 и снаружи неразличимы.
 */
@ApiTags('RenewalOfferPublic')
@Controller('renewal-offer/public')
export class PublicRenewalOfferController {
    constructor(private readonly service: RenewalOfferLinkService) {}

    @Get(':token')
    @ApiOperation({
        summary: 'Предложение по персональной ссылке',
        description:
            'Состав услуг и цены конкретного клиента. Считается просмотром ссылки.',
    })
    @ApiParam({
        name: 'token',
        description: 'Токен из адреса предложения',
        type: String,
    })
    @ApiOkResponse({ type: PublicRenewalOfferDto })
    @ApiGoneResponse({ description: 'Ссылка отозвана, истекла или неизвестна' })
    getOffer(@Param('token') token: string): Promise<PublicRenewalOfferDto> {
        return this.service.getPublicOffer(token);
    }
}
