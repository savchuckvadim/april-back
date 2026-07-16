import { Module } from '@nestjs/common';
import { EventSupportController } from './controllers/event-support.controller';
import { EventSupportStubService } from './services/event-support-stub.service';

/**
 * Поддерживающие эндпоинты фронта event-sales.
 * Контракты — реверс legacy PHP (`full/*`, `flow-front/*`);
 * реализация-заглушка наполняется по фазам миграции фронта
 * (см. docs/legacy-endpoint-gap.md).
 */
@Module({
    controllers: [EventSupportController],
    providers: [EventSupportStubService],
})
export class EventSupportModule {}
