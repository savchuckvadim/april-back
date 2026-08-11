import { Module } from '@nestjs/common';
import { QueueModule } from '@lib/queue';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { SkapStoreModule } from '@lib/skap-lib';
import { SkapAdminController } from './skap-admin.controller';

/**
 * Админ-поверхность импорта СКАП (только apps/admin — правило
 * app-api-surface): мониторинг прогонов/файлов/записей, ручные
 * перезапуски и кнопка «пересчитать» (постановка run-джоба, сам
 * конвейер-воркер живёт в apps/event-service).
 */
@Module({
    imports: [SkapStoreModule, QueueModule, PortalAppSettingsModule],
    controllers: [SkapAdminController],
})
export class SkapImportAdminModule {}
