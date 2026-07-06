import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from '@lib/logger';
import { MetricsModule } from '@lib/metrics';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { GlobalExceptionFilter, HealthModule } from '@/core';
import { EventModule } from './event.module';

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
    ],
    providers: [GlobalExceptionFilter],
})
export class EventSalesModule {}
