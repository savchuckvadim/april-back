import { Logger } from '@nestjs/common';
import {
    CronJobSchedule,
    formatCronJobsReport,
    summarizeCronJobs,
} from '../cron-jobs-report';
import { CronJobsReporter } from '../cron-jobs-reporter.service';

/** Фейковая задача: запуски уже «в поясе», setZone запоминает пояс. */
const job = (runs: string[], zones: string[] = []): CronJobSchedule => ({
    nextDates: count =>
        runs.slice(0, count).map(run => ({
            setZone: (zone: string) => {
                zones.push(zone);
                return { toFormat: () => run };
            },
        })),
});

describe('summarizeCronJobs', () => {
    it('сортирует задачи по имени и берёт два ближайших запуска в МСК', () => {
        const zones: string[] = [];
        const result = summarizeCronJobs(
            new Map([
                ['reject-revive', job(['01.10 12:00', '01.10 13:00', 'x'])],
                ['deal-audit', job(['01.10 12:30'], zones)],
            ]),
        );

        expect(result).toEqual([
            { name: 'deal-audit', nextRuns: ['01.10 12:30'] },
            { name: 'reject-revive', nextRuns: ['01.10 12:00', '01.10 13:00'] },
        ]);
        expect(zones).toEqual(['Europe/Moscow']);
    });

    it('сгенерированный Nest UUID показывает как «без имени»', () => {
        const [summary] = summarizeCronJobs(
            new Map([['3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', job([])]]),
        );

        expect(summary.name).toBe('без имени (задайте name в @Cron)');
    });
});

describe('formatCronJobsReport', () => {
    it('перечисляет кроны с ближайшими запусками', () => {
        const text = formatCronJobsReport([
            { name: 'deal-audit', nextRuns: ['01.10 12:30', '01.10 13:00'] },
        ]);

        expect(text).toBe(
            '🕒 Кроны запущены: 1 (ближайшие запуски, МСК)\n' +
                '• deal-audit — 01.10 12:30, 01.10 13:00',
        );
    });

    it('пустой реестр — подсказка про ScheduleModule', () => {
        expect(formatCronJobsReport([])).toContain('ScheduleModule.forRoot()');
    });
});

describe('CronJobsReporter', () => {
    const registry = (jobs: Map<string, CronJobSchedule>) =>
        ({ getCronJobs: () => jobs }) as never;

    afterEach(() => jest.restoreAllMocks());

    it('при старте отправляет список кронов в Telegram', () => {
        const log = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);

        new CronJobsReporter(
            registry(new Map([['deal-audit', job(['01.10 12:30'])]])),
        ).onApplicationBootstrap();

        expect(log).toHaveBeenCalledWith(
            expect.stringContaining('deal-audit'),
            { telegram: true },
        );
    });

    it('без кронов пишет ошибку, а не обычную строку', () => {
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        const log = jest.spyOn(Logger.prototype, 'log');

        new CronJobsReporter(registry(new Map())).onApplicationBootstrap();

        expect(error).toHaveBeenCalledWith(
            expect.stringContaining('не зарегистрированы'),
            { telegram: true },
        );
        expect(log).not.toHaveBeenCalled();
    });
});
