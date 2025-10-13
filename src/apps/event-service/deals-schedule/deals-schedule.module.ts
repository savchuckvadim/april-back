import { Module } from '@nestjs/common';
import { SchedulerService } from './services/shcedler.service';
import { TelegramModule } from '@/modules/telegram/telegram.module';
import { MoveDealStagesService } from './services/move-deal-stages';
import { QueueModule } from '@/modules/queue/queue.module';
import { EventServiceMoveDealStagesProcessor } from './processor/move-deal-stges.processor';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { DealsScheduleController } from './controllers/deals-schedule.controller';

@Module({
    imports: [TelegramModule, QueueModule, PBXModule],
    controllers: [DealsScheduleController],
    providers: [
        SchedulerService,
        MoveDealStagesService,
        EventServiceMoveDealStagesProcessor,
    ],
})
export class DealsScheduleModule {}
