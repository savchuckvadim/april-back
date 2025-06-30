import { Module } from "@nestjs/common";
import { SchedulerService } from "./services/shcedler.service";
import { TelegramModule } from "@/modules/telegram/telegram.module";
import { MoveDealStagesService } from "./services/move-deal-stages";
import { QueueModule } from "@/modules/queue/queue.module";
import { BullModule } from "@nestjs/bull";
import { QueueNames } from "@/modules/queue/constants/queue-names.enum";
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