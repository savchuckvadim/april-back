import { Module } from '@nestjs/common';
import { EventSalesController } from './controllers/event-sales.controller';
import { TelegramModule } from '@lib/telegram/telegram.module';
import { HttpModule } from '@nestjs/axios';
import { PBXModule } from '@lib/pbx';
import { EventSalesBxActivityController } from './controllers/bx-activity.controller';
import { EventSalesActivityUseCase } from './use-cases/bx-activity.use-case';
import { EventSalesHookModule } from './cold-hook/hook.module';
import { QueueModule } from '@lib/queue';
import { RedisModule } from '@lib/core/redis/redis.module';
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
export class EventModule {}
