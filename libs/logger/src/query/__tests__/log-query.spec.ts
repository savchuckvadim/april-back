import { ServiceUnavailableException } from '@nestjs/common';
import { findMissingModuleDependencies } from '@lib/core/testing/module-di';
import {
    buildAppsSql,
    buildDomainsSql,
    buildRowsSql,
    buildTopErrorsSql,
    LogSql,
} from '../log-query.sql';
import {
    buildLogConclusions,
    formatLogWindow,
    formatTimes,
} from '../log-conclusions';
import { LogQueryRepository, LogQueryClient } from '../log-query.repository';
import { LogQueryService, normalizeLogFilter } from '../log-query.service';
import { LogsAdminModule } from '../logs-admin.module';
import { LogAppStat } from '../log-query.types';

describe('SQL журналов', () => {
    it('строки: окно и все условия — параметрами, значения не в тексте запроса', () => {
        const sql = buildRowsSql(
            {
                hours: 6,
                app: "event-sales'; DROP",
                env: 'production',
                level: 'error',
                domain: 'gsr.bitrix24.ru',
                search: 'Access',
            },
            50,
        );
        expect(sql.params).toEqual({
            hours: 6,
            limit: 50,
            app: "event-sales'; DROP",
            env: 'production',
            level: 'error',
            domain: 'gsr.bitrix24.ru',
            search: 'Access',
        });
        expect(sql.query).not.toContain('DROP');
        expect(sql.query).not.toContain('gsr.bitrix24.ru');
        expect(sql.query).toContain('app = {app:String}');
        expect(sql.query).toContain('LIMIT {limit:UInt32}');
    });

    it('без фильтров — только окно', () => {
        const sql = buildRowsSql({ hours: 24 }, 100);
        expect(sql.params).toEqual({ hours: 24, limit: 100 });
        expect(sql.query).toContain(
            'WHERE timestamp >= now64(3) - toIntervalHour({hours:UInt32})',
        );
    });

    it('приложения: двойное окно и счёт по уровням без фильтра уровня', () => {
        const sql = buildAppsSql({ hours: 24, level: 'warn', app: 'bot' });
        expect(sql.params).toEqual({ hours: 24, app: 'bot' });
        expect(sql.query).toContain('toIntervalHour({hours:UInt32} * 2)');
        expect(sql.query).toContain('prevErrors');
    });

    it('частые ошибки: уровень шаблонов — фильтр или error; регулярки без обратных слешей', () => {
        const errors = buildTopErrorsSql({ hours: 24 }, 10);
        expect(errors.params.patternLevel).toBe('error');
        const warns = buildTopErrorsSql({ hours: 24, level: 'warn' }, 10);
        expect(warns.params.patternLevel).toBe('warn');
        const all: LogSql[] = [errors, buildDomainsSql({ hours: 1 }, 5)];
        for (const sql of all) {
            expect(sql.query).not.toContain(String.fromCharCode(92));
        }
    });
});

describe('normalizeLogFilter', () => {
    it('окно в пределах 1–720, пустые строки — без условия, домен без протокола', () => {
        expect(
            normalizeLogFilter({
                hours: 5000,
                app: '  ',
                domain: 'HTTPS://Gsr.bitrix24.ru/crm/',
                search: ' x ',
            }),
        ).toEqual({
            hours: 720,
            app: undefined,
            env: undefined,
            level: undefined,
            domain: 'gsr.bitrix24.ru',
            search: 'x',
        });
        expect(normalizeLogFilter({ hours: 0 }).hours).toBe(24);
    });
});

const app = (overrides: Partial<LogAppStat>): LogAppStat => ({
    app: 'event-sales',
    errors: 0,
    warnings: 0,
    total: 100,
    prevErrors: 0,
    prevTotal: 100,
    lastAt: '2026-10-26T10:00:00.000000Z',
    ...overrides,
});

describe('buildLogConclusions', () => {
    it('тихо — одной строкой', () => {
        expect(
            buildLogConclusions({
                hours: 24,
                apps: [app({})],
                topErrors: [],
                domains: [],
            }),
        ).toEqual(['За 24 ч ошибок и предупреждений нет.']);
    });

    it('всплеск, новые ошибки, замолчавшее приложение, частая ошибка и порталы', () => {
        const conclusions = buildLogConclusions({
            hours: 24,
            apps: [
                app({
                    app: 'event-sales',
                    errors: 30,
                    prevErrors: 10,
                    warnings: 5,
                }),
                app({ app: 'bot', errors: 12, prevErrors: 0 }),
                app({ app: 'kpi-report-sales', total: 0, prevTotal: 300 }),
                app({ app: 'admin', errors: 9, prevErrors: 0 }),
            ],
            topErrors: [
                {
                    app: 'event-sales',
                    sample: 'Batch error:   QUERY_LIMIT_EXCEEDED',
                    count: 25,
                    firstAt: '',
                    lastAt: '',
                    domains: ['gsr.bitrix24.ru'],
                },
            ],
            domains: [
                {
                    domain: 'gsr.bitrix24.ru',
                    errors: 20,
                    warnings: 1,
                    total: 50,
                },
                {
                    domain: 'april-dev.bitrix24.ru',
                    errors: 0,
                    warnings: 3,
                    total: 9,
                },
            ],
        });
        expect(conclusions).toEqual([
            'За 24 ч: ошибок 51, предупреждений 5, приложений с записями 3.',
            '«event-sales»: ошибок 30 — в 3,0 раза больше, чем за предыдущие 24 ч.',
            '«bot»: 12 ошибок, а за предыдущие 24 ч не было ни одной.',
            '«kpi-report-sales» за последние 24 ч не написал в журнал ни строки, а раньше писал — проверьте, работает ли.',
            'Чаще всего в «event-sales» (25 раз; порталы: gsr.bitrix24.ru): «Batch error: QUERY_LIMIT_EXCEEDED».',
            'Больше всего ошибок у порталов: gsr.bitrix24.ru (20).',
        ]);
    });

    it('одна ошибка в нескольких приложениях — один вывод про общую причину', () => {
        const redis = (appName: string, count: number) => ({
            app: appName,
            sample: 'Redis ошибка: connect ECONNREFUSED 127.0.0.1:6228',
            count,
            firstAt: '',
            lastAt: '',
            domains: [],
        });
        const conclusions = buildLogConclusions({
            hours: 24,
            apps: [app({ errors: 3 })],
            topErrors: [
                redis('konstructor', 30),
                redis('admin', 20),
                {
                    app: 'bot',
                    sample: 'Telegram 400',
                    count: 2,
                    firstAt: '',
                    lastAt: '',
                    domains: [],
                },
            ],
            domains: [],
        });
        expect(conclusions).toEqual([
            'За 24 ч: ошибок 3, предупреждений 0, приложений с записями 1.',
            'Одна и та же ошибка в 2 приложениях (konstructor, admin) — 50 раз: «Redis ошибка: connect ECONNREFUSED 127.0.0.1:6228». Похоже на общую причину: сеть, Redis, база или Битрикс.',
            'Чаще всего в «bot» (2 раза): «Telegram 400».',
        ]);
    });

    it('«раз» склоняется', () => {
        expect([1, 2, 5, 12, 22, 111, 104].map(formatTimes)).toEqual([
            '1 раз',
            '2 раза',
            '5 раз',
            '12 раз',
            '22 раза',
            '111 раз',
            '104 раза',
        ]);
    });

    it('окно словами', () => {
        expect(formatLogWindow(1)).toBe('1 ч');
        expect(formatLogWindow(24)).toBe('24 ч');
        expect(formatLogWindow(168)).toBe('7 дн.');
    });
});

describe('LogQueryRepository и LogQueryService', () => {
    const fakeClient = (rows: Record<string, unknown>[]): LogQueryClient => ({
        rows: <T>() => Promise.resolve(rows as T[]),
        close: () => Promise.resolve(),
    });

    it('числа ClickHouse строками приводятся, пустые домены выкидываются', async () => {
        const repository = new LogQueryRepository();
        repository.useClient(
            fakeClient([
                {
                    app: 'bot',
                    sample: 'x',
                    count: '7',
                    firstAt: 'a',
                    lastAt: 'b',
                    domains: ['', 'gsr.bitrix24.ru'],
                },
            ]),
        );
        expect(await repository.topErrors({ hours: 1 }, 5)).toEqual([
            {
                app: 'bot',
                sample: 'x',
                count: 7,
                firstAt: 'a',
                lastAt: 'b',
                domains: ['gsr.bitrix24.ru'],
            },
        ]);
    });

    it('ClickHouse не настроен — 503 с понятной причиной', async () => {
        const repository = new LogQueryRepository();
        repository.useClient(null);
        await expect(repository.rows({ hours: 1 }, 10)).rejects.toBeInstanceOf(
            ServiceUnavailableException,
        );
    });

    it('сводка: окно, выводы и нормализованный фильтр во все запросы', async () => {
        const repository = {
            apps: jest.fn().mockResolvedValue([app({ errors: 1 })]),
            topErrors: jest.fn().mockResolvedValue([]),
            domains: jest.fn().mockResolvedValue([]),
            rows: jest.fn().mockResolvedValue([]),
        };
        const service = new LogQueryService(
            repository as unknown as LogQueryRepository,
        );
        const now = new Date('2026-10-26T12:00:00.000Z');
        const summary = await service.summary(
            { hours: 2, domain: 'https://gsr.bitrix24.ru' },
            now,
        );
        expect(summary.from).toBe('2026-10-26T10:00:00.000Z');
        expect(summary.conclusions[0]).toBe(
            'За 2 ч: ошибок 1, предупреждений 0, приложений с записями 1.',
        );
        expect(repository.apps).toHaveBeenCalledWith(
            expect.objectContaining({ hours: 2, domain: 'gsr.bitrix24.ru' }),
        );
        await service.rows({ hours: 1 }, 9999);
        expect(repository.rows).toHaveBeenCalledWith(expect.anything(), 500);
    });
});

describe('DI-граф LogsAdminModule', () => {
    it('контроллер получает сервис журналов', () => {
        expect(findMissingModuleDependencies(LogsAdminModule)).toEqual([]);
    });
});
