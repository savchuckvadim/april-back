import { Module } from '@nestjs/common';
import { DealsScheduleModule } from './deals-schedule/deals-schedule.module';
import { SkapModule } from './skap/skap.module';

@Module({
    imports: [DealsScheduleModule, SkapModule],
    exports: [DealsScheduleModule, SkapModule],
})
export class EventServiceAppModule {}
