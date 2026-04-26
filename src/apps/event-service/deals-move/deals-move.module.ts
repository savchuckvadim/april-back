import { Module } from '@nestjs/common';
import { TelegramModule } from '@/modules/telegram/telegram.module';
import { MoveDealStagesService } from './services/move-deal-stages';
import { QueueModule } from '@/modules/queue/queue.module';
import { EventServiceMoveDealStagesProcessor } from './processor/move-deal-stges.processor';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { MoveDealQueueService } from './services/move-deal-queue.service';

@Module({
    imports: [PBXModule, TelegramModule, QueueModule],
    providers: [
        MoveDealQueueService,
        MoveDealStagesService,
        EventServiceMoveDealStagesProcessor,
    ],
    exports: [MoveDealQueueService],
})
export class DealsMoveModule {}
