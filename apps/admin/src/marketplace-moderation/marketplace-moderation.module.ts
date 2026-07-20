import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { TelegramService } from '@lib/telegram';
import { MailService } from '@lib/mail';
import { StorageService } from '@lib/core/storage';
import { getMailerConfig } from '@lib/core/config/mail/mailer.config';
import { PrismaModule } from '@lib/core/prisma/prisma.module';
import { MarketplaceModerationController } from './controllers/marketplace-moderation.controller';
import { MarketplaceModerationService } from './services/marketplace-moderation.service';
import { MarketplaceInviteService } from './services/marketplace-invite.service';
import { MarketplaceInviteMailer } from './services/marketplace-invite-mailer.port';
import { MarketplaceInviteMailerService } from './services/marketplace-invite-mailer.service';
import { MarketplaceModerationRepository } from './repositories/marketplace-moderation.repository';
import { MarketplaceModerationPrismaRepository } from './repositories/marketplace-moderation.prisma.repository';
import { MarketplaceInviteRepository } from './repositories/marketplace-invite.repository';
import { MarketplaceInvitePrismaRepository } from './repositories/marketplace-invite.prisma.repository';

/**
 * Модерация маркетплейс-подключений (этап 3 онбординга):
 * заявки, approve/block, статусы компонентов установки,
 * а также коды подключения портала (выпуск/отзыв/перевыпуск).
 *
 * Активацию продукта и запуск provisioning выполняет pbx по HTTP
 * (X-Admin-Key) — admin не дублирует маркетплейс-мир (очередь, токены).
 * Погашение кода подключения тоже живёт в pbx: admin только выпускает.
 *
 * TelegramService — провайдером, НЕ модулем: TelegramController открыл бы
 * публичную ручку отправки. Уведомления — best-effort.
 *
 * MailService — тем же приёмом провайдером, а НЕ через MailModule: тот
 * @Global и тянет за собой публичный MailController и Bull-процессор
 * очереди писем (в admin.module MailModule сознательно закомментирован).
 * Транспорт письмам даёт MailerModule.forRootAsync ниже; StorageService —
 * зависимость конструктора MailService (нужен только его offer-сценарию).
 */
@Module({
    imports: [
        PrismaModule,
        HttpModule,
        MailerModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: getMailerConfig,
            inject: [ConfigService],
        }),
    ],
    controllers: [MarketplaceModerationController],
    providers: [
        {
            provide: MarketplaceModerationRepository,
            useClass: MarketplaceModerationPrismaRepository,
        },
        {
            provide: MarketplaceInviteRepository,
            useClass: MarketplaceInvitePrismaRepository,
        },
        {
            provide: MarketplaceInviteMailer,
            useClass: MarketplaceInviteMailerService,
        },
        MarketplaceModerationService,
        MarketplaceInviteService,
        MailService,
        StorageService,
        TelegramService,
    ],
})
export class MarketplaceModerationModule {}
