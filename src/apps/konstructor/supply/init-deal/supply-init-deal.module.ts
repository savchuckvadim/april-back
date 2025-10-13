import { Module } from '@nestjs/common';
import { InitDealController } from './init-deal.controller';
import { InitDealUseCase } from './init-deal.use-case';
import { PBXModule } from '@/modules/pbx';
import { CopyInnerDealService } from './services/copy-inner-deal.service';
import { OnlineModule } from '@/clients/online/client/online/api-online.module';
import { TelegramModule } from '@/modules/telegram/telegram.module';
import { QueueModule } from '@/modules/queue/queue.module';
import { InitDealProcessor } from './processor/init-deal.processor';

@Module({
    imports: [PBXModule, OnlineModule, TelegramModule, QueueModule],
    controllers: [InitDealController],
    providers: [InitDealUseCase, CopyInnerDealService, InitDealProcessor],
    exports: [],
})
export class SupplyInitDealModule {}
