import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { QueueModule } from '@/modules/queue/queue.module';
import { WsModule } from '@/core/ws/ws.module';
import { EventReportInitService } from './services/init/event-report-init.service';
import { EventFlowStatusService } from './services/status/event-flow-status.service';
import { EventReportUseCase } from './use-cases/event-report.use-case';
import { EventFlowProcessor } from './queue/event-flow.processor';
import { EventSalesController } from './controllers/event-sales.controller';
import { PortalFieldsModule } from '../shared/portal-fields';

/**
 * Модуль event-report flow. Подключается родительским `EventSalesModule`.
 *
 * Контроллер только принимает отчёт и ставит его в очередь — весь batch
 * Битрикса выполняет `EventFlowProcessor`. Статус операции живёт в AppCache
 * (`AppCacheServiceModule` глобальный, отдельного импорта не требует).
 *
 * @Injectable-сервисы — только те, у кого нет bitrix-состояния. Остальные
 * flow-сервисы создаются через `new` внутри use-case рядом с конкретным
 * `BitrixService` (см. CLAUDE.md, race condition между порталами).
 */
@Module({
    // PortalFieldsModule — фактические привязки crm-полей лида: от них
    // зависит формат значения связи продажи (`to_sale_deal`).
    imports: [PBXModule, QueueModule, WsModule, PortalFieldsModule],
    controllers: [EventSalesController],
    providers: [
        EventReportInitService,
        EventReportUseCase,
        EventFlowStatusService,
        EventFlowProcessor,
    ],
})
export class EventReportModule {}
