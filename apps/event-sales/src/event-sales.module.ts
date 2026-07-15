import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from '@lib/logger';
import { MetricsModule } from '@lib/metrics';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { GlobalExceptionFilter, HealthModule } from '@/core';
import { EventModule } from './event.module';
import { BxDepartmentModule } from 'libs/bx-department';

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
    ],
    providers: [GlobalExceptionFilter],
    exports: [BxDepartmentModule],
})
export class EventSalesModule {}
