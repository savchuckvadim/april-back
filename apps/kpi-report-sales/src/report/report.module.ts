import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { QueueModule } from 'src/modules/queue/queue.module';
import { WsModule } from '@/core/ws/ws.module';
import { KpiReportController } from './controllers/kpi-report.controller';
import { SalesKpiReportQueueProcessor } from './queue/kpi-report.processor';

import { ReportResultCacheService } from './cache/report-result-cache.service';

/**
 * KPI-отчёт отдела продаж (тег Swagger «Sales Report»): расчёт показателей
 * по сотрудникам и статистика звонков.
 *
 * Режим queue — «кэш-синхронно + очередь при промахе» (ai/rules/
 * heavy-endpoint-queue.md): конверт результата в AppCache, compute в
 * SalesKpiReportQueueProcessor, доставка WS + поллинг. Легаси sync-режим —
 * расчёт в HTTP-запросе (до перевода фронта).
 *
 * Use-case'ы (ReportKpiUseCase, CallingStatisticUseCase) создаются
 * per-domain через `new` внутри контроллера/процессора — см. CLAUDE.md
 * про race condition c this.bitrix. В providers — только @Injectable
 * без bitrix-состояния.
 */
@Module({
    imports: [PBXModule, QueueModule, WsModule],
    controllers: [KpiReportController],
    providers: [SalesKpiReportQueueProcessor, ReportResultCacheService],
    exports: [ReportResultCacheService],
})
export class ReportModule {}
