import { Module } from '@nestjs/common';
import { KpiReportDownloadController } from './controllers/kpi-report-download.controller';
import { ExcelReportService } from './services/excel-report.service';

/**
 * Выгрузка KPI-отчёта в Excel (тег Swagger «KPI Sales Report Download»).
 *
 * Данные приходят готовыми в теле запроса — обращений к Bitrix нет,
 * поэтому модуль не зависит от PBX/очередей. ExcelReportService без
 * bitrix-состояния, поэтому @Injectable безопасен.
 */
@Module({
    controllers: [KpiReportDownloadController],
    providers: [ExcelReportService],
    exports: [ExcelReportService],
})
export class DownloadModule {}
