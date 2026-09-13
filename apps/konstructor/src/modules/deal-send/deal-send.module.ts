import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx';
import { QueueModule } from '@lib/queue/queue.module';
import { DealSendController } from './controllers/deal-send.controller';
import { DealSendUseCase } from './use-cases/deal-send.use-case';
import { DealSendProcessor } from './processor/deal-send.processor';

/**
 * Отправка сделки из конструктора в Bitrix — замена легаси
 * `garant-app.ru/api/konstructor/bitrix/deal/update`.
 */
@Module({
    imports: [PBXModule, QueueModule],
    controllers: [DealSendController],
    providers: [DealSendUseCase, DealSendProcessor],
    exports: [DealSendUseCase],
})
export class DealSendModule {}
