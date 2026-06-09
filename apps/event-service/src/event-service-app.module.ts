import { Module } from '@nestjs/common';
import { DealsScheduleModule } from './deals-schedule/deals-schedule.module';
import { SkapModule } from './skap/skap.module';
import { CallEventModule } from './call-event/call-event.module';

@Module({
    imports: [DealsScheduleModule, SkapModule, CallEventModule],
    exports: [DealsScheduleModule, SkapModule, CallEventModule],
})
export class EventServiceAppModule {}
