import { Module } from '@nestjs/common';
import { DealsScheduleModule } from './deals-schedule/deals-schedule.module';
import { SkapModule } from './skap/skap.module';
import { CallEventModule } from './call-event/call-event.module';
import { SsRestoreModule } from './ss-restore/ss-restore.module';

@Module({
    imports: [
        DealsScheduleModule,
        SkapModule,
        CallEventModule,
        SsRestoreModule,
    ],
    exports: [
        DealsScheduleModule,
        SkapModule,
        CallEventModule,
        SsRestoreModule,
    ],
})
export class EventServiceAppModule {}
