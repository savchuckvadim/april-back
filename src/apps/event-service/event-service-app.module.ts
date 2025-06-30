import { Module } from "@nestjs/common";
import { DealsScheduleModule } from "./deals-schedule/deals-schedule.module";


@Module({
    imports: [DealsScheduleModule],
    exports: [DealsScheduleModule],
})
export class EventServiceAppModule {}