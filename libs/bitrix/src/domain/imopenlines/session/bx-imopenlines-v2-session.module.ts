import { Module } from '@nestjs/common';
import { BxImOpenlinesV2SessionService } from './services/bx-imopenlines-v2-session.service';
import { BxImOpenlinesV2SessionBatchService } from './services/bx-imopenlines-v2-session.batch.service';

@Module({
    exports: [
        BxImOpenlinesV2SessionService,
        BxImOpenlinesV2SessionBatchService,
    ],
})
export class BitrixImOpenlinesV2SessionDomainModule {}
