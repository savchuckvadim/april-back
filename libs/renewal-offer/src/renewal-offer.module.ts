import { Module } from '@nestjs/common';
import { PrismaModule } from '@lib/core/prisma/prisma.module';
import { RenewalOfferLinkPrismaRepository } from './repositories/renewal-offer-link.prisma.repository';
import { RenewalOfferLinkService } from './services/renewal-offer-link.service';

/**
 * Персональные ссылки на КП на следующий год — только сервисы, без
 * контроллеров. Его импортируют те, кому нужен сервис:
 *
 * - RenewalOfferPublicModule — публичная ручка по токену (apps/pbx);
 * - RenewalOfferLinkAdminModule — список, выдача, отзыв (только apps/admin).
 *
 * Раскол нужен, чтобы контроллеры не протекали в Swagger чужих приложений:
 * Nest регистрирует контроллеры ЛЮБОГО импортированного модуля
 * (см. ai/rules/app-api-surface.md).
 *
 * PrismaModule импортируем сами, хотя он @Global: глобальность регистрирует
 * провайдеры для всех, но только после того, как модуль импортирован хоть
 * раз. В apps/admin он подключён не в корне, а в feature-модулях, поэтому
 * полагаться на чужой импорт — значит падать в рантайме, если тот модуль
 * уберут. Сборка такое не ловит.
 */
@Module({
    imports: [PrismaModule],
    providers: [RenewalOfferLinkService, RenewalOfferLinkPrismaRepository],
    exports: [RenewalOfferLinkService],
})
export class RenewalOfferModule {}
