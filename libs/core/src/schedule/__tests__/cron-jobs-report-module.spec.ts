import { Injectable, Logger, Module } from '@nestjs/common';
import { Cron, ScheduleModule } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { CronJobsReportModule } from '../cron-jobs-report.module';
import {
    CRON_JOBS_ROSTER_SOURCE,
    staticCronJobsRoster,
} from '../cron-jobs-roster';

/**
 * Живая сборка модуля через Nest: реестр кронов заполняет настоящий
 * ScheduleModule, отчёт уходит из onApplicationBootstrap, а источник
 * сведений приезжает из экспорта модуля, переданного в forRoot.
 */
@Injectable()
class SampleCrons {
    @Cron('0 0 3 * * *', { name: 'sample-cron' })
    tick(): void {}
}

@Module({ providers: [SampleCrons] })
class SampleModule {}

@Module({
    providers: [
        {
            provide: CRON_JOBS_ROSTER_SOURCE,
            useValue: staticCronJobsRoster(
                new Map([
                    [
                        'sample-cron',
                        { purpose: 'тестовый крон', portals: null },
                    ],
                ]),
            ),
        },
    ],
    exports: [CRON_JOBS_ROSTER_SOURCE],
})
class SampleRosterModule {}

const startApp = async (
    reportModule: Parameters<typeof Test.createTestingModule>[0]['imports'],
) => {
    const moduleRef = await Test.createTestingModule({
        imports: [
            ScheduleModule.forRoot(),
            SampleModule,
            ...(reportModule ?? []),
        ],
    }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    // Отчёт уходит без ожидания в хуке — даём промису завершиться.
    await new Promise(resolve => setImmediate(resolve));
    return app;
};

describe('CronJobsReportModule (сборка через Nest)', () => {
    afterEach(() => jest.restoreAllMocks());

    it('статический импорт: отчёт о кронах без сведений о порталах', async () => {
        const log = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);

        const app = await startApp([CronJobsReportModule]);

        const message = log.mock.calls
            .map(call => String(call[0]))
            .find(text => text.startsWith('🕒 Кроны запущены'));
        expect(message).toContain('• sample-cron — ');
        expect(message).not.toContain('привязка к порталам');
        await app.close();
    });

    it('forRoot с модулем-источником: сведения из его экспорта попадают в отчёт', async () => {
        const log = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);

        const app = await startApp([
            CronJobsReportModule.forRoot({ imports: [SampleRosterModule] }),
        ]);

        const message = log.mock.calls
            .map(call => String(call[0]))
            .find(text => text.startsWith('🕒 Кроны запущены'));
        expect(message).toContain('• sample-cron — ');
        expect(message).toContain('\n  тестовый крон');
        await app.close();
    });
});
