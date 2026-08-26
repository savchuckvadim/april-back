import { Module } from '@nestjs/common';
import { ColdHookModule } from './cold-hook/hook.module';
import { LeadHookModule } from './lead-hook/lead-hook.module';
import { EventReportModule } from './event-report/event-report.module';
import { EventSupportModule } from './event-support/event-support.module';
import { EventSalesBxRecordsModule } from './bx-records/bx-records.module';
import { SalesHooksModule } from './sales-hooks/sales-hooks.module';
import { LeadRequestModule } from './lead-request/lead-request.module';
import { PresentationSurveyModule } from './presentation-survey/presentation-survey.module';
import { ZprFlowModule } from './zpr-flow/zpr-flow.module';
import { PresentationFlowModule } from './presentation-flow/presentation-flow.module';

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
        // Легаси-опросник после презентации (хвост/«5К» отдельным запросом)
        PresentationSurveyModule,
        // Сайд-очередь ЗПР-смарта («Звонки По решению»)
        ZprFlowModule,
        // Сайд-очередь смарта «Презентации» (зеркало сделок ОП Презентации)
        PresentationFlowModule,
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
