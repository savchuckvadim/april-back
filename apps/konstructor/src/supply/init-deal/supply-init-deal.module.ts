import { Module } from '@nestjs/common';
import { InitDealController } from './init-deal.controller';
import { InitDealUseCase } from './init-deal.use-case';
import { PBXModule } from '@lib/pbx';
import { CopyInnerDealService } from './services/copy-inner-deal.service';
import { OnlineModule } from '@lib/online/client/online/api-online.module';
import { TelegramModule } from '@lib/telegram/telegram.module';
import { QueueModule } from '@lib/queue/queue.module';
import { InitDealProcessor } from './processor/init-deal.processor';
import { OrkHistoryBxListModule } from '@lib/portal-lib/pbx/pbx-ork-history-bx-list';

@Module({
    imports: [
        PBXModule,
        OnlineModule,
        TelegramModule,
        QueueModule,
        OrkHistoryBxListModule,
    ],
    controllers: [InitDealController],
    providers: [InitDealUseCase, CopyInnerDealService, InitDealProcessor],
    exports: [],
})
export class SupplyInitDealModule {}
