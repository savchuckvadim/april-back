import { Module } from '@nestjs/common';
import { BxImOpenlinesBotSessionService } from './services/bx-imopenlines-bot-session.service';
import { BxImOpenlinesBotSessionBatchService } from './services/bx-imopenlines-bot-session.batch.service';

@Module({
    exports: [
        BxImOpenlinesBotSessionService,
        BxImOpenlinesBotSessionBatchService,
    ],
})
export class BitrixImOpenlinesBotSessionDomainModule {}
