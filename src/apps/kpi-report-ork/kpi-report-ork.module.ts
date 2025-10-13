import { Module } from '@nestjs/common';
import { KpiReportOrkEventController } from './event/kpi-report-ork-event.controller';
import { KpiReportOrkEventService } from './event/kpi-report-ork-event.service';
import { PBXModule } from '@/modules/pbx';

@Module({
    imports: [PBXModule],
    controllers: [KpiReportOrkEventController],
    providers: [KpiReportOrkEventService],
})
export class KpiReportOrkModule {}
