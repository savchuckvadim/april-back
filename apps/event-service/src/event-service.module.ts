import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GlobalExceptionFilter, HealthModule } from '@/core';
import { EventServiceController } from './event-service.controller';
import { EventServiceService } from './event-service.service';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['apps/event-service/.env', '.env'],
        }),
        HealthModule,
    ],
    controllers: [EventServiceController],
    providers: [EventServiceService, GlobalExceptionFilter],
})
export class EventServiceModule {}
