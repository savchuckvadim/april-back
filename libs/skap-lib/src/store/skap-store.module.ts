import { Module } from '@nestjs/common';
import { PrismaModule } from '@lib/core/prisma/prisma.module';
import { SkapFileRepository } from './skap-file.repository';
import { SkapItemRepository } from './skap-item.repository';
import { SkapRunRepository } from './skap-run.repository';
import { SkapSessionRepository } from './skap-session.repository';
import { SkapSubscriptionRepository } from './skap-subscription.repository';

/**
 * Store-слой импорта СКАП: журнал файлов/прогонов, записи логин×месяц,
 * сессии и подписки. Только БД — без Bitrix и бизнес-логики конвейера.
 */
@Module({
    imports: [PrismaModule],
    providers: [
        SkapFileRepository,
        SkapItemRepository,
        SkapSessionRepository,
        SkapSubscriptionRepository,
        SkapRunRepository,
    ],
    exports: [
        SkapFileRepository,
        SkapItemRepository,
        SkapSessionRepository,
        SkapSubscriptionRepository,
        SkapRunRepository,
    ],
})
export class SkapStoreModule {}
