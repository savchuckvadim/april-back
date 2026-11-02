import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { EventSupportController } from './controllers/event-support.controller';
import { EventSupportStubService } from './services/event-support-stub.service';
import { EventSupportService } from './services/event-support.service';

/**
 * Поддерживающие эндпоинты фронта event-sales.
 * Контракты — реверс legacy PHP (`full/*`, `flow-front/*`);
 * реализация-заглушка наполняется по фазам миграции фронта
 * (см. docs/legacy-endpoint-gap.md).
 */
@Module({
    imports: [PBXModule],
    controllers: [EventSupportController],
    providers: [EventSupportStubService, EventSupportService],
})
export class EventSupportModule {}
