import { Module } from '@nestjs/common';
import { PortalStoreModule } from '../portal-store.module';
import { PortalKeysController } from './portal-keys.controller';

/**
 * Админ-слой доставки для ключей интеграций портала
 * (`admin/portal/:portalId/keys`). Импортирует {@link PortalStoreModule} ради
 * `PortalKeysService` и регистрирует только админ-контроллер. Подключать в
 * приложении админки, а НЕ в konstructor/pbx-install и т.п.
 */
@Module({
    imports: [PortalStoreModule],
    controllers: [PortalKeysController],
})
export class PortalKeysAdminModule {}
