import { Module } from '@nestjs/common';
import { ProviderImageModule } from '../provider-image';
import { ProviderImageLegacyImportModule } from '../provider-image/legacy-import';
import { ProviderModule } from './provider.module';
import { ProviderAdminController } from './provider.admin.controller';
import { ProviderImageAdminController } from './provider-image.admin.controller';
import { ProviderImageLegacyImportAdminController } from './provider-image-legacy-import.admin.controller';

/**
 * Админ-слой доставки для поставщиков портала (`admin/portal/provider`).
 * Импортирует {@link ProviderModule} ради `ProviderService` и
 * {@link ProviderImageModule} ради картинок реквизитов (печать, подписи,
 * логотип) и регистрирует только админ-контроллеры. Подключать в приложении
 * админки, а НЕ в konstructor.
 *
 * {@link ProviderImageLegacyImportModule} и его контроллер — временный перенос
 * картинок из легаси: после переноса удаляются вместе с папкой
 * `provider-image/legacy-import/`.
 */
@Module({
    imports: [
        ProviderModule,
        ProviderImageModule,
        ProviderImageLegacyImportModule,
    ],
    controllers: [
        ProviderAdminController,
        ProviderImageAdminController,
        ProviderImageLegacyImportAdminController,
    ],
})
export class ProviderAdminModule {}
