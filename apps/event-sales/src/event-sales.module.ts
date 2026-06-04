import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GlobalExceptionFilter, HealthModule } from '@/core';
import { EventSalesController } from './event-sales.controller';
import { EventSalesService } from './event-sales.service';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['apps/event-sales/.env', '.env'],
        }),
        HealthModule,
    ],
    controllers: [EventSalesController],
    providers: [EventSalesService, GlobalExceptionFilter],
})
export class EventSalesModule {}
