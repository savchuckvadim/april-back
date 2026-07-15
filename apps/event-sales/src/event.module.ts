import { Module } from '@nestjs/common';
import { ColdHookModule } from './cold-hook/hook.module';
import { LeadHookModule } from './lead-hook/lead-hook.module';
import { EventReportModule } from './event-report/event-report.module';
import { EventSupportModule } from './event-support/event-support.module';
import { EventSalesBxRecordsModule } from './bx-records/bx-records.module';

@Module({
    imports: [
        ColdHookModule,
        LeadHookModule,
        EventReportModule,
        EventSupportModule,
        EventSalesBxRecordsModule,
    ],
    exports: [
        ColdHookModule,
        LeadHookModule,
        EventReportModule,
        EventSupportModule,
        EventSalesBxRecordsModule,
    ],
})
export class EventModule {}
