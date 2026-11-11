import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx';
import { QueueModule } from '@lib/queue/queue.module';
import { RedisModule } from '@lib/core/redis/redis.module';
import { GarantModule } from '@lib/garant';
import { DealSendController } from './controllers/deal-send.controller';
import { DealSendUseCase } from './use-cases/deal-send.use-case';
import { DealSendStatusUseCase } from './use-cases/deal-send-status.use-case';
import { DealSendPreflightUseCase } from './use-cases/deal-send-preflight.use-case';
import { DealSendProcessor } from './processor/deal-send.processor';
import { DealSendSupplyTextsService } from './services/deal-send-supply-texts.service';

/**
 * Отправка сделки из конструктора в Bitrix — замена легаси
 * `garant-app.ru/api/konstructor/bitrix/deal/update`.
 */
@Module({
    // GarantModule — SupplyTextService: тексты поставки по коду (решение 2);
    // RedisModule — ключ повтора создания (requestKey)
    imports: [PBXModule, QueueModule, GarantModule, RedisModule],
    controllers: [DealSendController],
    providers: [
        DealSendUseCase,
        DealSendStatusUseCase,
        DealSendPreflightUseCase,
        DealSendProcessor,
        DealSendSupplyTextsService,
    ],
    exports: [DealSendUseCase],
})
export class DealSendModule {}
