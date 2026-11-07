import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx';
import { RedisModule } from 'src/core/redis/redis.module';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { PortalEmployeesAdminController } from './controllers/portal-employees.admin.controller';
import { PortalEmployeesService } from './services/portal-employees.service';

/**
 * Админ-слой «сотрудники портала» (`admin/portal/:portalId/employees`):
 * список для выбора в настройках вместо ввода Bitrix-id цифрами.
 *
 * Отдельный модуль, как {@link VendorSuperUserAdminModule}: роут нужен только
 * админке и не должен попадать в Swagger прикладных приложений
 * (ai/rules/app-api-surface.md). Подключать в приложении админки.
 */
@Module({
    imports: [PBXModule, RedisModule, PortalStoreModule],
    controllers: [PortalEmployeesAdminController],
    providers: [PortalEmployeesService],
})
export class PortalEmployeesAdminModule {}
