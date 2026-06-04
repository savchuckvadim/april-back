import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GlobalExceptionFilter, HealthModule } from '@/core';
import { KpiReportServiceController } from './kpi-report-service.controller';
import { KpiReportServiceService } from './kpi-report-service.service';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['apps/kpi-report-service/.env', '.env'],
        }),
        HealthModule,
    ],
    controllers: [KpiReportServiceController],
    providers: [KpiReportServiceService, GlobalExceptionFilter],
})
export class KpiReportServiceModule {}
