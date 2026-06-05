import { Module } from '@nestjs/common';
import { BitrixImOpenlinesBotSessionDomainModule } from './bot-session/bx-imopenlines-bot-session.module';

@Module({
    imports: [BitrixImOpenlinesBotSessionDomainModule],
    exports: [BitrixImOpenlinesBotSessionDomainModule],
})
export class BitrixImOpenlinesAggregateDomainModule {}
