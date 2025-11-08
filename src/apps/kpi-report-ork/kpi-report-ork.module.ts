import { Module } from '@nestjs/common';
import { KpiController } from './event/kpi-report-ork-event.controller';
import { KpiReportOrkEventService } from './event/kpi-report-ork-event.service';
import { PBXModule } from '@/modules/pbx';
import { DealsReportController } from './deals/controller/ork-deals-report.controller';
import { OrkDealsReportService } from './deals/services/ork-deals-report.service';
import { CommunicationsController } from './communications/controller/kpi-report-ork-communications.controller';
import { UserReportController } from './user-report/controllers/ork-user-report.controller';
import { OrkUserReportService } from './user-report/services/ork-user-report.service';
import { OrkHistoryBxListModule } from '@/modules/pbx-ork-history-bx-list';
import { QueueModule } from '@/modules/queue/queue.module';
import { OrkUserReportQueueProcessor } from './user-report/queue/ork-user-report.processor';
import { WsModule } from '@/core/ws';
import { RedisModule } from '@/core/redis/redis.module';

@Module({
    imports: [
        PBXModule,
        OrkHistoryBxListModule,
        QueueModule,
        WsModule,
        RedisModule
    ],
    controllers: [
        KpiController,
        DealsReportController,
        CommunicationsController,
        UserReportController,
    ],
    providers: [
        KpiReportOrkEventService,
        OrkDealsReportService,
        OrkUserReportService,
        OrkUserReportQueueProcessor
    ],
})
export class KpiReportOrkModule { }
