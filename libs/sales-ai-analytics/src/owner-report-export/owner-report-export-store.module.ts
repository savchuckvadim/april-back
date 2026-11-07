import { Module } from '@nestjs/common';
import { RedisModule } from '@lib/core/redis/redis.module';
import { OwnerReportExportStore } from './owner-report-export.store';

/**
 * Хранилище выгрузки PDF отчёта собственнику (Redis) — без контроллеров:
 * его подключают и воркер kpi-report-sales, и админ-сервисный модуль.
 */
@Module({
    imports: [RedisModule],
    providers: [OwnerReportExportStore],
    exports: [OwnerReportExportStore],
})
export class OwnerReportExportStoreModule {}
