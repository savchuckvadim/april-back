import { Test } from '@nestjs/testing';
import { RedisService } from '@lib/core/redis/redis.service';
import { RopReportTicker } from '../engine/rop-report.ticker';
import { RopPeriodRunner } from '../engine/rop-period.runner';
import { RopReportsModule } from '../rop-reports.module';
import { RopRunStateService } from '../state/rop-run-state.service';
import { RopTaskMemoryService } from '../state/rop-task-memory.service';
import { FakeRedis } from '../state/__tests__/fixtures/fake-redis.fixture';

/**
 * DI-граф модуля каркаса собирается: каждый провайдер получает свои
 * зависимости из модуля и его импортов. Redis подменён — подключения нет.
 */
describe('RopReportsModule', () => {
    it('поднимается и отдаёт движок, прогон периода, состояние и память задач', async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [RopReportsModule],
        })
            .overrideProvider(RedisService)
            .useValue(new FakeRedis().service())
            .compile();

        expect(moduleRef.get(RopReportTicker)).toBeInstanceOf(RopReportTicker);
        expect(moduleRef.get(RopPeriodRunner)).toBeInstanceOf(RopPeriodRunner);
        expect(moduleRef.get(RopRunStateService)).toBeInstanceOf(
            RopRunStateService,
        );
        expect(moduleRef.get(RopTaskMemoryService)).toBeInstanceOf(
            RopTaskMemoryService,
        );
        await moduleRef.close();
    });
});
