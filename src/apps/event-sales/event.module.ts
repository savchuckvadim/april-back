import { Module } from '@nestjs/common';
import { EventSalesController } from './controllers/event-sales.controller';
import { EventSalesFlowUseCase } from './use-cases/flow.use-case';
import { TelegramModule } from 'src/modules/telegram/telegram.module';
import { HttpModule } from '@nestjs/axios';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { EventSalesBxActivityController } from './controllers/bx-activity.controller';
import { EventSalesActivityUseCase } from './use-cases/bx-activity.use-case';

@Module({
    imports: [
        PBXModule,
        TelegramModule,
        HttpModule,
    ],
    controllers: [EventSalesController, EventSalesBxActivityController],
    providers: [EventSalesFlowUseCase, EventSalesActivityUseCase],
})
export class EventSalesModule { }
