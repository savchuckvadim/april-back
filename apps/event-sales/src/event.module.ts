import { Module } from '@nestjs/common';
import { ColdHookModule } from './cold-hook/hook.module';
import { LeadHookModule } from './lead-hook/lead-hook.module';
import { EventReportModule } from './event-report/event-report.module';

@Module({
    imports: [ColdHookModule, LeadHookModule, EventReportModule],
    exports: [ColdHookModule, LeadHookModule, EventReportModule],
})
export class EventModule {}
