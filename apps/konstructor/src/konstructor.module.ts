import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from '@lib/logger';
import { MetricsModule } from '@lib/metrics';
import { GlobalExceptionFilter, HealthModule } from '@/core';
import { KonstructorController } from './konstructor.controller';
import { KonstructorService } from './konstructor.service';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['apps/konstructor/.env', '.env'],
        }),
        LoggerModule.forRoot({ appName: 'konstructor' }),
        MetricsModule.forRoot({ appName: 'konstructor' }),
        HealthModule,
    ],
    controllers: [KonstructorController],
    providers: [KonstructorService, GlobalExceptionFilter],
})
export class KonstructorModule {}
