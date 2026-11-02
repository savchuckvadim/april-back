import { Module } from '@nestjs/common';
import { PublicRenewalOfferController } from './controllers/public-renewal-offer.controller';
import { RenewalOfferModule } from './renewal-offer.module';

/**
 * Публичная ручка предложения по токену: подключается в apps/pbx.
 * Отдельным модулем, чтобы admin, импортируя сервис, не публиковал
 * у себя публичный роут (см. ai/rules/app-api-surface.md).
 */
@Module({
    imports: [RenewalOfferModule],
    controllers: [PublicRenewalOfferController],
})
export class RenewalOfferPublicModule {}
