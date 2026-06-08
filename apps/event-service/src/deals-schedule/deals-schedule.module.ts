import { Module } from '@nestjs/common';
import { SchedulerService } from './services/shcedler.service';
import { DealsMoveModule } from '../deals-move/deals-move.module';
import { TelegramModule } from '@lib/telegram/telegram.module';
import { DealsOrderModule } from '../deals-order/deals-order.module';
import { SmartActModule } from '../smart-act';

@Module({
    imports: [
        DealsMoveModule,
        TelegramModule,
        DealsOrderModule, // контроль дублей, поиск ошибок в заполнении crm
        SmartActModule,
    ],
    providers: [SchedulerService],
    exports: [SmartActModule], //для того чтобы выставить контроллер для webhook наружу
})
export class DealsScheduleModule {}
