import { Module } from '@nestjs/common';
import { BxImOpenlinesOperatorSessionService } from './services/bx-imopenlines-operator-session.service';
import { BxImOpenlinesOperatorSessionBatchService } from './services/bx-imopenlines-operator-session.batch.service';

@Module({
    exports: [
        BxImOpenlinesOperatorSessionService,
        BxImOpenlinesOperatorSessionBatchService,
    ],
})
export class BitrixImOpenlinesOperatorSessionDomainModule {}
