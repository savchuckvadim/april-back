import { Module } from "@nestjs/common";
import { SchedulerService } from "./services/shcedler.service";
import { TelegramModule } from "@/modules/telegram/telegram.module";
import { MoveDealStagesService } from "./services/move-deal-stages";
import { QueueModule } from "@/modules/queue/queue.module";
import { EventServiceMoveDealStagesProcessor } from "./processor/move-deal-stges.processor";


@Module({
    imports: [

        TelegramModule,
        QueueModule
    ],
    controllers: [],
    providers: [
        SchedulerService,
        MoveDealStagesService,
        EventServiceMoveDealStagesProcessor
    ],
})
export class DealsScheduleModule { }