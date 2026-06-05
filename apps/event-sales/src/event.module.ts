import { Module } from '@nestjs/common';
import { ColdHookModule } from './cold-hook/hook.module';
import { EventReportModule } from './event-report/event-report.module';

@Module({
    imports: [
        // PBXModule,
        // TelegramModule,
        // HttpModule,
        // QueueModule,
        // RedisModule,
        ColdHookModule,
        EventReportModule,
    ],

    exports: [ColdHookModule, EventReportModule],
})
export class EventModule {}
