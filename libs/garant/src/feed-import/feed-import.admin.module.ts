import { Module } from '@nestjs/common';
import { GarantFeedImportModule } from './feed-import.module';
import { GarantFeedImportAdminController } from './controllers/garant-feed-import.admin.controller';

/**
 * Админ-слой импорта Google-фида: подключается ТОЛЬКО в apps/admin
 * (ai/rules/app-api-surface.md) — у остальных приложений роутов импорта нет.
 */
@Module({
    imports: [GarantFeedImportModule],
    controllers: [GarantFeedImportAdminController],
})
export class GarantFeedImportAdminModule {}
