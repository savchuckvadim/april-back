import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx/pbx.module';
import { RedisModule } from '@lib/core/redis/redis.module';
import { QueueModule } from '@lib/queue/queue.module';
import { VibecodeModule } from '@lib/vibecode';
import { TranscriptionModule } from '@lib/call-lib/transcription/transcription.module';
import { AiModule } from '@lib/call-lib/ai/ai.module';
import { CallAnalysisUseCase } from './use-cases/call-analysis.use-case';
import { TaskCompleteUseCase } from './use-cases/task-complete.use-case';
import { StartBitrixTranscriptionUseCase } from './use-cases/start-bitrix-transcription.use-case';
import { GetBitrixTranscriptionResultUseCase } from './use-cases/get-bitrix-transcription-result.use-case';
import { CallAnalysisController } from './controllers/call-analysis.controller';
import { BitrixTranscriptionController } from './controllers/bitrix-transcription.controller';
import { EventFlowMapperService } from './services/event-flow-mapper.service';
import { FlowDtoStorageService } from './services/flow-dto-storage.service';
import { BitrixTranscribeProcessor } from './queue/bitrix-transcribe.processor';

@Module({
    imports: [
        PBXModule,
        RedisModule,
        QueueModule,
        TranscriptionModule,
        AiModule,
        // Точка доступа к VibeCode: клиент + резолвер пер-портального ключа
        VibecodeModule,
    ],
    controllers: [CallAnalysisController, BitrixTranscriptionController],
    providers: [
        CallAnalysisUseCase,
        TaskCompleteUseCase,
        EventFlowMapperService,
        FlowDtoStorageService,
        StartBitrixTranscriptionUseCase,
        GetBitrixTranscriptionResultUseCase,
        BitrixTranscribeProcessor,
    ],
})
export class CallAnalysisModule {}
