import { Module } from '@nestjs/common';
import { ProviderModule } from './provider.module';
import { ProviderAdminController } from './provider.admin.controller';

/**
 * Админ-слой доставки для поставщиков портала (`admin/portal/provider`).
 * Импортирует {@link ProviderModule} ради `ProviderService` и регистрирует
 * только админ-контроллер. Подключать в приложении админки, а НЕ в konstructor.
 */
@Module({
    imports: [ProviderModule],
    controllers: [ProviderAdminController],
})
export class ProviderAdminModule {}
