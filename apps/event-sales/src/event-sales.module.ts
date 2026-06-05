import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { GlobalExceptionFilter, HealthModule } from '@/core';
import { EventSalesController } from './event-sales.controller';
import { EventSalesService } from './event-sales.service';
import { EventModule } from './event.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['apps/event-sales/.env', '.env'],
        }),
        EventEmitterModule.forRoot(),
        HealthModule,
        EventModule,
    ],
    controllers: [EventSalesController],
    providers: [EventSalesService, GlobalExceptionFilter],
})
export class EventSalesModule {}
