import { Module } from '@nestjs/common';
import { QueueModule } from '@lib/queue/queue.module';
import { SalesDocumentFlowService } from './services/sales-document-flow.service';

/**
 * Сообщение о сформированных документах в поток продаж event-sales (стадия
 * основной сделки, KPI, «История»). Постановка события: очередь
 * `event-sales-document-flow`, воркер живёт в event-sales.
 */
@Module({
    imports: [QueueModule],
    providers: [SalesDocumentFlowService],
    exports: [SalesDocumentFlowService],
})
export class SalesDocumentFlowModule {}
