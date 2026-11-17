import { Module } from '@nestjs/common';
import { RedisModule } from '@lib/core/redis/redis.module';
import { RopPeriodRunner } from './engine/rop-period.runner';
import { RopReportTicker } from './engine/rop-report.ticker';
import { RopRunStateService } from './state/rop-run-state.service';
import { RopTaskMemoryService } from './state/rop-task-memory.service';

/**
 * Каркас отчётов РОПу — только сервисы без Битрикса в полях: состояние
 * прогонов и память задач в Redis, прогон периода и движок тика.
 * Контроллеров нет (ai/rules/app-api-surface.md); `@Cron` объявляет
 * тонкий планировщик каждого отчёта в своём приложении.
 *
 * `RedisModule` не глобальный — импортируется здесь явно.
 */
@Module({
    imports: [RedisModule],
    providers: [
        RopRunStateService,
        RopTaskMemoryService,
        RopPeriodRunner,
        RopReportTicker,
    ],
    exports: [
        RopRunStateService,
        RopTaskMemoryService,
        RopPeriodRunner,
        RopReportTicker,
    ],
})
export class RopReportsModule {}
