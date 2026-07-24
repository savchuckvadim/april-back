import { Module } from '@nestjs/common';
import { ReportSettingsController } from './report-settings.controller';
import { UiSettingsController } from './ui-settings.controller';
import { ReportSettingsService } from './report-settings.service';

/** Фильтры KPI-отчёта (замена legacy online API, PrismaModule — @Global). */
@Module({
    controllers: [ReportSettingsController, UiSettingsController],
    providers: [ReportSettingsService],
    exports: [ReportSettingsService],
})
export class ReportSettingsModule {}
