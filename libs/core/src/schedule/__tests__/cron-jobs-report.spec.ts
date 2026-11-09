import { Logger } from '@nestjs/common';
import {
    CronJobSchedule,
    formatCronJobsReport,
    mergeCronJobsRoster,
    summarizeCronJobs,
} from '../cron-jobs-report';
import { CronJobsReporter } from '../cron-jobs-reporter.service';
import {
    CronJobInfo,
    CronJobsRosterSource,
    staticCronJobsRoster,
} from '../cron-jobs-roster';

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

const roster = (entries: [string, CronJobInfo][]) =>
    new Map<string, CronJobInfo>(entries);

const HEADER = '🕒 Кроны запущены: 1 (ближайшие запуски, МСК)\n';

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

describe('mergeCronJobsRoster', () => {
    const jobs = [
        { name: 'deal-audit', nextRuns: ['01.10 12:30'] },
        { name: 'xo-rescue', nextRuns: ['01.10 12:00'] },
    ];

    it('без источника сведений строки остаются голым реестром', () => {
        expect(mergeCronJobsRoster(jobs, null)).toEqual({
            lines: jobs,
            warnings: [],
        });
    });

    it('подклеивает сведения по имени, неописанный крон помечает null', () => {
        const info: CronJobInfo = { purpose: 'аудит сделок', portals: [] };

        const { lines } = mergeCronJobsRoster(
            jobs,
            roster([['deal-audit', info]]),
        );

        expect(lines).toEqual([
            { ...jobs[0], info },
            { ...jobs[1], info: null },
        ]);
    });

    it('кроны, описанные без регистрации в Nest, попадают в предупреждение', () => {
        const { warnings } = mergeCronJobsRoster(
            jobs,
            roster([['lead-sla', { purpose: 'SLA', portals: [] }]]),
        );

        expect(warnings).toEqual([
            '⚠️ Описаны, но не зарегистрированы: lead-sla',
        ]);
    });
});

describe('formatCronJobsReport', () => {
    it('перечисляет кроны с ближайшими запусками', () => {
        const text = formatCronJobsReport([
            { name: 'deal-audit', nextRuns: ['01.10 12:30', '01.10 13:00'] },
        ]);

        expect(text).toBe(HEADER + '• deal-audit — 01.10 12:30, 01.10 13:00');
    });

    it('со сведениями — вторая строка: назначение и порталы с пометками', () => {
        const text = formatCronJobsReport([
            {
                name: 'xo-rescue',
                nextRuns: ['01.10 12:00'],
                info: {
                    purpose: 'подстраховка ХО',
                    portals: [
                        { domain: 'garant.bitrix24.ru', note: 'только в лог' },
                        { domain: 'gsr.bitrix24.ru' },
                    ],
                },
            },
        ]);

        expect(text).toContain(
            '• xo-rescue — 01.10 12:00\n' +
                '  подстраховка ХО: garant.bitrix24.ru (только в лог), gsr.bitrix24.ru',
        );
    });

    it('пустой список порталов — «нигде не включён», null — крон без привязки', () => {
        const text = formatCronJobsReport([
            {
                name: 'lead-sla',
                nextRuns: ['01.10 12:00'],
                info: { purpose: 'SLA принятия заявок', portals: [] },
            },
            {
                name: 'moveDeals',
                nextRuns: ['01.10 15:00'],
                info: { purpose: 'перенос сделок', portals: null },
            },
        ]);

        expect(text).toContain('  SLA принятия заявок: нигде не включён');
        expect(text).toContain('• moveDeals — 01.10 15:00\n  перенос сделок');
    });

    it('крон без сведений при наличии источника помечается, предупреждения — сразу под заголовком', () => {
        const text = formatCronJobsReport(
            [{ name: 'new-cron', nextRuns: ['01.10 12:00'], info: null }],
            ['⚠️ Описаны, но не зарегистрированы: old-cron'],
        );

        expect(text).toBe(
            HEADER +
                '⚠️ Описаны, но не зарегистрированы: old-cron\n' +
                '• new-cron — 01.10 12:00\n' +
                '  привязка к порталам не описана',
        );
    });

    it('пустой реестр — подсказка про ScheduleModule', () => {
        expect(formatCronJobsReport([])).toContain('ScheduleModule.forRoot()');
    });
});

describe('CronJobsReporter', () => {
    const registry = (jobs: Map<string, CronJobSchedule>) =>
        ({ getCronJobs: () => jobs }) as never;
    const jobs = new Map([['deal-audit', job(['01.10 12:30'])]]);
    const flush = () => new Promise(resolve => setImmediate(resolve));

    afterEach(() => jest.restoreAllMocks());

    it('при старте отправляет список кронов в Telegram', async () => {
        const log = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);

        await new CronJobsReporter(registry(jobs)).report();

        expect(log).toHaveBeenCalledWith(
            expect.stringContaining('deal-audit'),
            { telegram: true },
        );
    });

    it('хук старта запускает отчёт, не дожидаясь его', () => {
        const reporter = new CronJobsReporter(registry(jobs));
        const report = jest
            .spyOn(reporter, 'report')
            .mockResolvedValue(undefined);

        reporter.onApplicationBootstrap();

        expect(report).toHaveBeenCalledTimes(1);
    });

    it('упавший отчёт остаётся в логе ошибкой, а не необработанным отказом', async () => {
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        const reporter = new CronJobsReporter(registry(jobs));
        jest.spyOn(reporter, 'report').mockRejectedValue(
            new Error('сломалось'),
        );

        reporter.onApplicationBootstrap();
        await flush();

        expect(error).toHaveBeenCalledWith(
            'Отчёт о кронах не отправлен: сломалось',
        );
    });

    it('сведения источника попадают в сообщение', async () => {
        const log = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);
        const source = staticCronJobsRoster(
            roster([
                [
                    'deal-audit',
                    {
                        purpose: 'аудит сделок',
                        portals: [{ domain: 'garant.bitrix24.ru' }],
                    },
                ],
            ]),
        );

        await new CronJobsReporter(registry(jobs), source).report();

        expect(log).toHaveBeenCalledWith(
            expect.stringContaining('  аудит сделок: garant.bitrix24.ru'),
            { telegram: true },
        );
    });

    it('сбой источника — список кронов всё равно уходит, причина под заголовком', async () => {
        const log = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        const source: CronJobsRosterSource = {
            resolve: () => Promise.reject(new Error('БД недоступна')),
        };

        await new CronJobsReporter(registry(jobs), source).report();

        expect(log).toHaveBeenCalledWith(
            HEADER +
                '⚠️ Сведения о порталах не собраны: БД недоступна\n' +
                '• deal-audit — 01.10 12:30',
            { telegram: true },
        );
        expect(error).toHaveBeenCalledWith(
            expect.stringContaining('БД недоступна'),
        );
    });

    it('без кронов пишет ошибку, а не обычную строку', async () => {
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        const log = jest.spyOn(Logger.prototype, 'log');

        await new CronJobsReporter(registry(new Map())).report();

        expect(error).toHaveBeenCalledWith(
            expect.stringContaining('не зарегистрированы'),
            { telegram: true },
        );
        expect(log).not.toHaveBeenCalled();
    });
});
