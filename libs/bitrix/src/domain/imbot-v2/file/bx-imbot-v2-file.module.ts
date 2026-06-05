import { Module } from '@nestjs/common';
import { BxImBotV2FileService } from './services/bx-imbot-v2-file.service';
import { BxImBotV2FileBatchService } from './services/bx-imbot-v2-file.batch.service';

@Module({
    exports: [BxImBotV2FileService, BxImBotV2FileBatchService],
})
export class BitrixImBotV2FileDomainModule {}
