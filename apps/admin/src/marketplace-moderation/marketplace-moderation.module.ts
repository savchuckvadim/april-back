import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TelegramService } from '@lib/telegram';
import { PrismaModule } from '@lib/core/prisma/prisma.module';
import { MarketplaceModerationController } from './controllers/marketplace-moderation.controller';
import { MarketplaceModerationService } from './services/marketplace-moderation.service';
import { MarketplaceModerationRepository } from './repositories/marketplace-moderation.repository';
import { MarketplaceModerationPrismaRepository } from './repositories/marketplace-moderation.prisma.repository';

/**
 * Модерация маркетплейс-подключений (этап 3 онбординга):
 * заявки, approve/block, статусы компонентов установки.
 *
 * Активацию продукта и запуск provisioning выполняет pbx по HTTP
 * (X-Admin-Key) — admin не дублирует маркетплейс-мир (очередь, токены).
 *
 * TelegramService — провайдером, НЕ модулем: TelegramController открыл бы
 * публичную ручку отправки. Уведомления — best-effort.
 */
@Module({
    imports: [PrismaModule, HttpModule],
    controllers: [MarketplaceModerationController],
    providers: [
        {
            provide: MarketplaceModerationRepository,
            useClass: MarketplaceModerationPrismaRepository,
        },
        MarketplaceModerationService,
        TelegramService,
    ],
})
export class MarketplaceModerationModule {}
