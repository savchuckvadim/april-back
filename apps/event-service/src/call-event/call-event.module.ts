import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx';
import { QueueModule } from '@/modules/queue/queue.module';
import { CallEventController } from './controllers/call-event.controller';
import { CallEventQueueService } from './queue/call-event-queue.service';
import { CallEventProcessor } from './queue/call-event.processor';
import { CallEventInitService } from './services/init/call-event-init.service';
import { CallEventUseCase } from './use-cases/call-event.use-case';

/**
 * Модуль обработки события звонка отдела сервиса (порт legacy `/calling`).
 *
 * @Injectable — только оркестратор, init и инфраструктура очереди. Flow-сервисы
 * (`CallingFlowService`, `CompanyDealUpdateService`, `SmartReportFlowService`)
 * создаются через `new(bitrix, portal)` внутри use-case рядом с конкретным
 * инстансом Bitrix (CLAUDE.md, race condition между порталами).
 */
@Module({
    imports: [PBXModule, QueueModule],
    controllers: [CallEventController],
    providers: [
        CallEventUseCase,
        CallEventInitService,
        CallEventQueueService,
        CallEventProcessor,
    ],
})
export class CallEventModule {}
