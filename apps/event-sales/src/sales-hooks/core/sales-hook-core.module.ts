import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx';
import { RedisModule } from '@lib/core/redis/redis.module';
import { QueueModule } from '@/modules/queue/queue.module';
import { EventSilenceModule } from '@lib/core/event-silence';
import { WsModule } from '@/core/ws/ws.module';
import { SalesHookStatusService } from './services/sales-hook-status.service';
import { SalesHookIdempotencyService } from './services/sales-hook-idempotency.service';
import { SalesHookRegistryService } from './services/sales-hook-registry.service';
import { SalesHookRunnerService } from './services/sales-hook-runner.service';
import { SalesHookDispatchService } from './services/sales-hook-dispatch.service';
import { SalesHookSilenceGateway } from './services/sales-hook-silence.gateway';
import { SalesHookOpsProcessor } from './queue/sales-hook-ops.processor';
import { SalesHookSilenceSubscriber } from './queue/sales-hook-silence.subscriber';
import { SalesHookOperationsController } from './controllers/sales-hook-operations.controller';
import { SalesHookWebhookGuard } from './guards/sales-hook-webhook.guard';

/**
 * Ядро каркаса sales-хуков: транспорт (silence + очередь операций),
 * статусы, идемпотентность, WS. Доменной логики здесь НЕТ — она живёт в
 * модулях конкретных хуков, которые регистрируют свои use-case-ы под
 * токеном SALES_HOOK_USE_CASES (см. SALES_HOOKS_GUIDE.md).
 *
 * Написан lib-ready: зависимости только библиотечные (@lib/pbx, queue,
 * event-silence, ws, app-cache) — при появлении второго потребителя
 * переезжает в libs/core/async-operation механически.
 */
@Module({
    imports: [
        PBXModule,
        RedisModule,
        QueueModule,
        EventSilenceModule,
        WsModule,
    ],
    controllers: [SalesHookOperationsController],
    providers: [
        SalesHookStatusService,
        SalesHookIdempotencyService,
        SalesHookRegistryService,
        SalesHookRunnerService,
        SalesHookDispatchService,
        SalesHookSilenceGateway,
        SalesHookOpsProcessor,
        SalesHookSilenceSubscriber,
        SalesHookWebhookGuard,
    ],
    exports: [
        SalesHookStatusService,
        SalesHookIdempotencyService,
        SalesHookRegistryService,
        SalesHookDispatchService,
        SalesHookSilenceGateway,
        SalesHookWebhookGuard,
    ],
})
export class SalesHookCoreModule {}
