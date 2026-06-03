import { Module } from '@nestjs/common';
import { EventSalesController } from './controllers/event-sales.controller';
// import { EventSalesFlowUseCase } from './use-cases/flow.use-case';
import { TelegramModule } from 'src/modules/telegram/telegram.module';
import { HttpModule } from '@nestjs/axios';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { EventSalesBxActivityController } from './controllers/bx-activity.controller';
import { EventSalesActivityUseCase } from './use-cases/bx-activity.use-case';
import { EventSalesHookModule } from './cold-hook/hook.module';
import { QueueModule } from '@/modules/queue/queue.module';
import { RedisModule } from '@/core/redis/redis.module';
import { EventReportModule } from './event-report/event-report.module';

@Module({
    imports: [
        PBXModule,
        TelegramModule,
        HttpModule,
        QueueModule,
        RedisModule,
        EventSalesHookModule,
        EventReportModule,
    ],
    controllers: [EventSalesController, EventSalesBxActivityController],
    providers: [EventSalesActivityUseCase],
    exports: [EventSalesHookModule, EventReportModule],
})
export class EventSalesModule {}
