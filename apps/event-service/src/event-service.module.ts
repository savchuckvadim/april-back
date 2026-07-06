import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from '@lib/logger';
import { MetricsModule } from '@lib/metrics';
import { GlobalExceptionFilter, HealthModule } from '@/core';
import { EventServiceController } from './event-service.controller';
import { EventServiceService } from './event-service.service';
import { EventServiceAppModule } from './event-service-app.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['apps/event-service/.env', '.env'],
        }),
        LoggerModule.forRoot({ appName: 'event-service' }),
        MetricsModule.forRoot({ appName: 'event-service' }),
        ScheduleModule.forRoot(),
        HealthModule,
        EventServiceAppModule,
    ],
    controllers: [EventServiceController],
    providers: [EventServiceService, GlobalExceptionFilter],
})
export class EventServiceModule {}
