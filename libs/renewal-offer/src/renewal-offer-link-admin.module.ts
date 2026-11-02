import { Module } from '@nestjs/common';
import { RenewalOfferLinkController } from './controllers/renewal-offer-link.controller';
import { RenewalOfferModule } from './renewal-offer.module';

/**
 * Управление ссылками на КП из админки: список, выдача, отзыв.
 * Подключается ТОЛЬКО в apps/admin — иначе админские операции попадут
 * в Swagger pbx и в сгенерированный клиент чужих приложений.
 */
@Module({
    imports: [RenewalOfferModule],
    controllers: [RenewalOfferLinkController],
})
export class RenewalOfferLinkAdminModule {}
