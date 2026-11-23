import { Module } from '@nestjs/common';
import { ProviderImageModule } from '../provider-image';
import { ProviderModule } from './provider.module';
import { ProviderAdminController } from './provider.admin.controller';
import { ProviderImageAdminController } from './provider-image.admin.controller';

/**
 * Админ-слой доставки для поставщиков портала (`admin/portal/provider`).
 * Импортирует {@link ProviderModule} ради `ProviderService` и
 * {@link ProviderImageModule} ради картинок реквизитов (печать, подписи,
 * логотип) и регистрирует только админ-контроллеры. Подключать в приложении
 * админки, а НЕ в konstructor.
 */
@Module({
    imports: [ProviderModule, ProviderImageModule],
    controllers: [ProviderAdminController, ProviderImageAdminController],
})
export class ProviderAdminModule {}
