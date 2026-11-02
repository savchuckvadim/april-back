import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { QueueModule } from '@/modules/queue/queue.module';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings/portal-app-settings.module';
import { BxDepartmentModule } from '@lib/bx-department';
import { EventReportInitService } from '../event-report/services/init/event-report-init.service';
import { EventReportSettingsResolver } from '../event-report/services/settings/event-report-settings.resolver';
import { EventReportActingManagerService } from '../event-report/services/acting-manager/event-report-acting-manager.service';
import { EventReportImpersonationService } from '../event-report/services/impersonation/event-report-impersonation.service';
import { EventFlowStatusService } from '../event-report/services/status/event-flow-status.service';
import { EventReportTmcUseCase } from './use-cases/event-report-tmc.use-case';
import { TmcPresentationApprovalService } from './services/tmc-presentation-approval.service';
import { TmcApprovalRescueService } from './services/tmc-approval-rescue.service';
import { TmcApprovalRescueScheduler } from './services/tmc-approval-rescue.scheduler';
import { EventReportTmcController } from './controllers/event-report-tmc.controller';
import { RedisModule } from '@/core/redis/redis.module';

/**
 * Поток ТМЦ (режим «Менеджер ТМЦ» в «Звонках»).
 *
 * Отчёт ТМЦ ставится в ту же очередь EVENT_SALES_FLOW, что и отчёт отдела
 * продаж; воркер (`EventFlowProcessor` в EventReportModule) выбирает
 * use-case по подразделению в DTO — поэтому модуль ЭКСПОРТИРУЕТ use-case и
 * импортируется EventReportModule, а не наоборот (без цикла).
 *
 * Свои провайдеры stateless-сервисов отчёта (init, настройки, режим
 * руководителя, статусы) — отдельные инстансы: состояния у них нет, а
 * тянуть сюда EventReportModule нельзя.
 *
 * Контроллер — ручка согласования заявки для робота РПА (замена легаси
 * `/initpres/success`); живёт в приложении event-sales, в Swagger других
 * приложений не попадает.
 *
 * Крон подстраховки согласования (`tmc-approval-rescue`) ставит то же
 * согласование по утверждённым элементам РПА, до которых робот не донёс
 * вызов: Redis-лок — RedisModule, настройки — PortalAppSettingsModule,
 * портал — PBXModule (без любого из них приложение не стартует, см.
 * xo-dispatch-rescue.module.spec).
 */
@Module({
    imports: [
        PBXModule,
        QueueModule,
        PortalAppSettingsModule,
        BxDepartmentModule,
        RedisModule,
    ],
    controllers: [EventReportTmcController],
    providers: [
        EventReportTmcUseCase,
        EventReportInitService,
        EventReportSettingsResolver,
        EventReportActingManagerService,
        EventReportImpersonationService,
        EventFlowStatusService,
        TmcPresentationApprovalService,
        TmcApprovalRescueService,
        TmcApprovalRescueScheduler,
    ],
    exports: [EventReportTmcUseCase],
})
export class EventReportTmcModule {}
