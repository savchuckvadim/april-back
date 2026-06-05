import { Module } from '@nestjs/common';
import { BxImBotCommandService } from './services/bx-imbot-command.service';
import { BxImBotCommandBatchService } from './services/bx-imbot-command.batch.service';

@Module({
    exports: [BxImBotCommandService, BxImBotCommandBatchService],
})
export class BitrixImBotCommandDomainModule {}
