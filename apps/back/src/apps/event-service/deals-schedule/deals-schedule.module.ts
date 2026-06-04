import { Module } from '@nestjs/common';
import { SchedulerService } from './services/shcedler.service';
import { DealsMoveModule } from '../deals-move/deals-move.module';
import { TelegramModule } from '@lib/telegram/telegram.module';
import { DealsOrderModule } from '../deals-order/deals-order.module';

@Module({
    imports: [DealsMoveModule, TelegramModule, DealsOrderModule],
    providers: [SchedulerService],
})
export class DealsScheduleModule {}
