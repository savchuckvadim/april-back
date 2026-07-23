import { Module } from '@nestjs/common';
import { ReportSettingsController } from './report-settings.controller';
import { ReportSettingsService } from './report-settings.service';

/** Фильтры KPI-отчёта (замена legacy online API, PrismaModule — @Global). */
@Module({
    controllers: [ReportSettingsController],
    providers: [ReportSettingsService],
    exports: [ReportSettingsService],
})
export class ReportSettingsModule {}
