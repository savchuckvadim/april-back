import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { RedisModule } from '@lib/core/redis/redis.module';
import { QueueModule } from '@lib/queue';
import { EventDocumentFlowProcessor } from './queue/event-document-flow.processor';
import { EventDocumentInitService } from './services/init/event-document-init.service';
import { EventDocumentFlowStatusService } from './services/status/event-document-flow-status.service';
import { EventDocumentReportUseCase } from './use-cases/event-document-report.use-case';

/**
 * Поток документов конструктора: КП, счёт, договор и отчёт о поставке
 * двигают «ОП Основная», обновляют поля карточек и пишутся в «ОП KPI» и
 * «ОП История».
 *
 * Вход один — очередь `EVENT_SALES_DOCUMENT_FLOW`: событие ставит бэк
 * конструктора после генерации документа. HTTP-ручек у модуля нет, поэтому
 * наружу (Swagger) ничего не добавляется (ai/rules/app-api-surface.md).
 *
 * `RedisModule` — отметка «событие взято в работу»; `QueueModule` — сама
 * очередь и слот клиента. Оба не глобальные: без явного импорта приложение
 * не поднимается.
 */
@Module({
    imports: [PBXModule, RedisModule, QueueModule],
    providers: [
        EventDocumentReportUseCase,
        EventDocumentInitService,
        EventDocumentFlowStatusService,
        EventDocumentFlowProcessor,
    ],
})
export class EventDocumentReportModule {}
