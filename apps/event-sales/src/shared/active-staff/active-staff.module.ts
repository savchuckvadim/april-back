import { Module } from '@nestjs/common';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings/portal-app-settings.module';
import { ActiveStaffService } from './active-staff.service';

/**
 * «Кто работает сейчас» для распределения работы. Без контроллеров:
 * из приложения наружу ничего не торчит. AppCache — @Global.
 */
@Module({
    imports: [PortalAppSettingsModule],
    providers: [ActiveStaffService],
    exports: [ActiveStaffService],
})
export class ActiveStaffModule {}
