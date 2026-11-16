import { Module } from '@nestjs/common';
import { TranscriptionStoreModule } from '../transcription/transcription-store.module';
import { AdminCallPageLinkController } from './call-page-link.admin.controller';
import { CallPageLinkModule } from './call-page-link.module';

/**
 * Админ-слой ссылок на страницу разбора звонка (`admin/call-page`): только
 * контроллер, подключается в apps/admin (правило app-api-surface) — в
 * приложениях порталов этих ручек нет.
 */
@Module({
    imports: [CallPageLinkModule, TranscriptionStoreModule],
    controllers: [AdminCallPageLinkController],
})
export class CallPageLinkAdminModule {}
