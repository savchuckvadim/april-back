import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from '@lib/logger';
import { MetricsModule } from '@lib/metrics';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { GlobalExceptionFilter, HealthModule } from '@/core';
import { EventModule } from './event.module';
import { BxDepartmentModule } from 'libs/bx-department';
import { AiRagModule } from '@lib/ai-rag';
import {
    TranscriptionModule,
    CallAnalysisModule,
    AiModule,
} from '@lib/call-lib';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['apps/event-sales/.env', '.env'],
        }),
        LoggerModule.forRoot({ appName: 'event-sales' }),
        MetricsModule.forRoot({ appName: 'event-sales' }),
        EventEmitterModule.forRoot(),
        HealthModule,
        EventModule,

        //from shared
        BxDepartmentModule,
        AiRagModule,

        // звонки: транскрибация + AI-анализ (перенесено из apps/back)
        TranscriptionModule,
        CallAnalysisModule,
        AiModule,
    ],
    providers: [GlobalExceptionFilter],
    exports: [BxDepartmentModule, AiRagModule],
})
export class EventSalesModule {}
