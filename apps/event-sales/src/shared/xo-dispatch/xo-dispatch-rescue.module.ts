import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx/pbx.module';
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
 */
@Module({
    imports: [PBXModule, ColdHookV2Module],
    providers: [
        XoDispatchRescueService,
        XoDispatchRescueScheduler,
        PortalWorkingHoursService,
    ],
    exports: [XoDispatchRescueService],
})
export class XoDispatchRescueModule {}
