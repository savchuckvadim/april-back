import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { RedisModule } from '@lib/core/redis/redis.module';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings/portal-app-settings.module';
import { ColdHookV2Module } from '../../cold-hook-v2/hook.module';
import { PortalWorkingHoursService } from '../working-hours/portal-working-hours.service';
import { XoDispatchRescueService } from './xo-dispatch-rescue.service';
import { XoDispatchRescueScheduler } from './xo-dispatch-rescue.scheduler';

/**
 * Подстраховка ХО по компаниям и сделкам: крон досылает холодный звонок,
 * который не доехал (хук упал).
 *
 * Контроллеров нет намеренно — наружу из приложения ничего не торчит,
 * запускается только по расписанию (ai/rules/app-api-surface.md).
 *
 * `ColdHookV2Module` импортируется ради экспортируемого
 * `ColdHookSilinceEndpointV2Service`: досылка идёт тем же путём, что и
 * обычный хук — через silence-буфер, а не в обход него.
 *
 * RedisModule и PortalAppSettingsModule ОБЯЗАТЕЛЬНЫ: планировщик держит
 * Redis-лок от наложения тиков и читает настройки порталов. Оба модуля НЕ
 * глобальные — без явного импорта приложение не поднимается вовсе
 * (UnknownDependenciesException на старте и краш-луп event-sales; ровно
 * на этом уже обжигались 26.08.2026 в реанимации отказников).
 */
@Module({
    imports: [
        PBXModule,
        RedisModule,
        PortalAppSettingsModule,
        ColdHookV2Module,
    ],
    providers: [
        XoDispatchRescueService,
        XoDispatchRescueScheduler,
        PortalWorkingHoursService,
    ],
    exports: [XoDispatchRescueService],
})
export class XoDispatchRescueModule {}
