import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx';
import { RedisModule } from '@lib/core/redis/redis.module';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings/portal-app-settings.module';
import { BxDepartmentModule } from 'libs/bx-department';
import { SalesHookCoreModule } from '../sales-hooks/core/sales-hook-core.module';
import { LeadRequestService } from './services/lead-request.service';
import { LeadRequestAcceptService } from './services/lead-request-accept.service';
import { LeadRequestLiveNamesService } from './services/lead-request-live-names.service';
import { LeadRequestController } from './controllers/lead-request.controller';
import { LeadRequestSlaService } from './sla/lead-request-sla.service';
import { LeadRequestSlaScheduler } from './sla/lead-request-sla.scheduler';

/**
 * Карточка заявки/лида для приложения «Звонки» + механика принятия
 * (назначение ≠ принятие) + SLA-контроль «не принял за N минут — передать
 * и уведомить руководителя» (cron-страховка против потерянных вебхуков).
 *
 * Контроллер — часть поверхности event-sales, поэтому живёт прямо в
 * приложении (правило ai/rules/app-api-surface.md о lib-модулях тут не
 * применяется — это app-модуль).
 */
@Module({
    imports: [
        PBXModule,
        RedisModule,
        // Лёгкий модуль настроек: только PortalAppSettingsService, без
        // остального стора (ключи/outer) — из event-sales ничего не торчит.
        PortalAppSettingsModule,
        BxDepartmentModule,
        SalesHookCoreModule,
    ],
    controllers: [LeadRequestController],
    providers: [
        LeadRequestService,
        LeadRequestAcceptService,
        LeadRequestLiveNamesService,
        LeadRequestSlaService,
        LeadRequestSlaScheduler,
    ],
    exports: [LeadRequestService, LeadRequestAcceptService],
})
export class LeadRequestModule {}
