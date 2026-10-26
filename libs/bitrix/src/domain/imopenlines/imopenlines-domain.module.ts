import { Module } from '@nestjs/common';
import { BitrixImOpenlinesBotSessionDomainModule } from './bot-session/bx-imopenlines-bot-session.module';
import { BitrixImOpenlinesV2SessionDomainModule } from './session/bx-imopenlines-v2-session.module';
import { BitrixImOpenlinesOperatorSessionDomainModule } from './operator-session/bx-imopenlines-operator-session.module';

@Module({
    imports: [
        BitrixImOpenlinesBotSessionDomainModule,
        BitrixImOpenlinesV2SessionDomainModule,
        BitrixImOpenlinesOperatorSessionDomainModule,
    ],
    exports: [
        BitrixImOpenlinesBotSessionDomainModule,
        BitrixImOpenlinesV2SessionDomainModule,
        BitrixImOpenlinesOperatorSessionDomainModule,
    ],
})
export class BitrixImOpenlinesAggregateDomainModule {}
