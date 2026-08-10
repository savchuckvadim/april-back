import { Module } from '@nestjs/common';
import { ColdHookModule } from './cold-hook/hook.module';
import { LeadHookModule } from './lead-hook/lead-hook.module';
import { EventReportModule } from './event-report/event-report.module';
import { EventSupportModule } from './event-support/event-support.module';
import { EventSalesBxRecordsModule } from './bx-records/bx-records.module';
import { SalesHooksModule } from './sales-hooks/sales-hooks.module';
import { LeadRequestModule } from './lead-request/lead-request.module';

@Module({
    imports: [
        ColdHookModule,
        LeadHookModule,
        EventReportModule,
        EventSupportModule,
        EventSalesBxRecordsModule,
        // Новое семейство sales-хуков: silence + очередь операций + WS
        SalesHooksModule,
        // Карточка заявки/лида для интерфейса «Звонков»
        LeadRequestModule,
    ],
    exports: [
        ColdHookModule,
        LeadHookModule,
        EventReportModule,
        EventSupportModule,
        EventSalesBxRecordsModule,
        SalesHooksModule,
        LeadRequestModule,
    ],
})
export class EventModule {}
