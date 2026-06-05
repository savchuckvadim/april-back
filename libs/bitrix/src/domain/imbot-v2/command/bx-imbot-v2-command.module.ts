import { Module } from '@nestjs/common';
import { BxImBotV2CommandService } from './services/bx-imbot-v2-command.service';
import { BxImBotV2CommandBatchService } from './services/bx-imbot-v2-command.batch.service';

@Module({
    exports: [BxImBotV2CommandService, BxImBotV2CommandBatchService],
})
export class BitrixImBotV2CommandDomainModule {}
