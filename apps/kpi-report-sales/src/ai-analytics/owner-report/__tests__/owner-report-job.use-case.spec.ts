import { Logger } from '@nestjs/common';
import {
    buildOwnerReportFacts,
    DEFAULT_WORK_CALENDAR,
} from '@lib/sales-ai-analytics';
import {
    call,
    resetCounter,
} from '@lib/sales-ai-analytics/model/owner-report/__tests__/owner-report.fixture';
import { AI_ANALYTICS_WS_EVENTS } from '../../constants/ai-analytics.const';
import { OwnerReportJobUseCase } from '../../domain/use-cases/owner-report-job.use-case';
import { OwnerReportMonthlyComposer } from '../owner-report-monthly.composer';
import type { DatedLiteRow } from '../../domain/loaders/lite-row.mapper';
import type { OwnerReportSources } from '../owner-report-sources.loader';
import { AI_OWNER_REPORT_SNAPSHOT_RECORD } from '../owner-report.const';
import type { AiOwnerReportJobData } from '../owner-report.types';

const NOW = new Date('2026-11-02T06:00:00Z');

const DATA: AiOwnerReportJobData = {
    domain: 'test.bitrix24.ru',
    kind: 'month',
    periodKey: '2026-10',
    from: '2026-10-01',
    to: '2026-10-31',
    requestKey: 'key:2026-10',
    socketId: 's1',
};

const period = (from: string, to: string) => ({
    kind: 'month' as const,
    from,
    to,
    timeZone: 'Europe/Moscow',
    calendar: DEFAULT_WORK_CALENDAR,
});

/** Строка фикстуры всегда со временем звонка — тип выборки приложения. */
const dated = (row: ReturnType<typeof call>): DatedLiteRow =>
    row as DatedLiteRow;

const sources = (): OwnerReportSources => ({
    period: period('2026-10-01', '2026-10-31'),
    previousPeriod: period('2026-09-01', '2026-09-30'),
    managerIds: ['7', '8'],
    rows: [
        dated(call({ day: '2026-10-05' })),
        dated(
            call({ day: '2026-10-06', managerId: '8', outcome: 'postponed' }),
        ),
        dated(
            call({
                day: '2026-10-13',
                callType: 'decision',
                outcome: 'postponed',
                transcriptionId: 'dz',
            }),
        ),
    ],
    previousRows: [dated(call({ day: '2026-09-07' }))],
    minDurationByType: { default: 60 },
    telephony: { outbound: null, connected: 10, short: 3 },
    crm: null,
    qualityLink: null,
    names: { '7': 'Надежда', '8': 'Виолетта' },
});

const makeUseCase = (
    options: {
        narrative?: () => Promise<unknown>;
        sources?: () => Promise<OwnerReportSources>;
        /** Месячный снапшот по ключу (domain, kind, periodKey); null — нет. */
        monthly?: (
            domain: string,
            kind: string,
            periodKey: string,
        ) => Promise<unknown>;
    } = {},
) => {
    const loader = {
        load: jest.fn(options.sources ?? (() => Promise.resolve(sources()))),
        periods: jest.fn().mockResolvedValue({
            period: period('2026-07-01', '2026-09-30'),
            previousPeriod: period('2026-04-01', '2026-06-30'),
        }),
        names: jest.fn().mockResolvedValue({ '7': 'Надежда' }),
    };
    const narrative = {
        complete: jest.fn(
            options.narrative ??
                (() =>
                    Promise.resolve({
                        payload: {
                            summary: [
                                'Абзац один.',
                                'Абзац два.',
                                'Абзац три.',
                            ],
                            leaks: [],
                            managers: [],
                        },
                        provider: 'vibecode',
                        model: 'test-model',
                        tokens: 1200,
                    })),
        ),
    };
    const smartLinks = {
        resolveLinks: jest
            .fn()
            .mockResolvedValue(
                new Map([
                    ['dz', 'https://test.bitrix24.ru/crm/type/1/details/5/'],
                ]),
            ),
    };
    const params = {
        load: jest.fn().mockResolvedValue({ paramsVersion: 'p1' }),
    };
    const snapshots = {
        upsert: jest
            .fn<Promise<unknown>, [unknown, unknown]>()
            .mockResolvedValue({ id: '1', supersededIds: [], written: 1 }),
    };
    const reader = {
        availablePeriods: jest.fn().mockResolvedValue(['2026-10', '2026-09']),
        // Месячные снапшоты для сводного отчёта: по умолчанию их нет.
        payload: jest.fn(options.monthly ?? (() => Promise.resolve(null))),
    };
    const cache = { setJson: jest.fn().mockResolvedValue(undefined) };
    const ws = { sendToClient: jest.fn() };
    const composer = new OwnerReportMonthlyComposer(
        reader as never,
        loader as never,
    );
    const useCase = new OwnerReportJobUseCase(
        loader as never,
        composer,
        narrative as never,
        smartLinks as never,
        params as never,
        snapshots as never,
        reader as never,
        cache as never,
        ws as never,
    );
    return { useCase, loader, narrative, snapshots, cache, ws, reader };
};

describe('OwnerReportJobUseCase', () => {
    beforeEach(() => {
        resetCounter();
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
        jest.spyOn(Logger.prototype, 'error').mockImplementation(
            () => undefined,
        );
    });
    afterEach(() => jest.restoreAllMocks());

    it('собирает факты и текст, принимает резюме модели, пишет снапшот, кэш и WS done', async () => {
        const { useCase, snapshots, cache, ws, loader } = makeUseCase();
        const dto = await useCase.execute(DATA, NOW);

        expect(loader.load).toHaveBeenCalledWith(
            DATA.domain,
            expect.objectContaining({ periodKey: '2026-10' }),
            expect.objectContaining({
                periodKey: '2026-09',
                from: '2026-09-01',
            }),
            NOW,
        );
        expect(dto).toMatchObject({
            kind: 'month',
            periodKey: '2026-10',
            source: 'model',
            narrativeReason: null,
            availablePeriods: ['2026-10', '2026-09'],
        });
        expect(dto.text.summary).toEqual([
            'Абзац один.',
            'Абзац два.',
            'Абзац три.',
        ]);
        expect(dto.text.summarySource).toBe('model');
        expect(dto.text.tiles[0]).toMatchObject({
            value: '3',
            compare: 'в прошлом периоде 1',
        });
        expect(dto.text.managers[0].name).toBe('Надежда');
        // Ссылка на разбор-пример утечки дожима подставлена по id транскрипции.
        const followup = dto.text.leaks.find(
            leak => leak.code === 'followup_no_decision',
        );
        expect(followup?.exampleLinks).toEqual([
            'https://test.bitrix24.ru/crm/type/1/details/5/',
        ]);

        expect(snapshots.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                type: AI_OWNER_REPORT_SNAPSHOT_RECORD.TYPE,
                periodKey: '2026-10',
                managerId: null,
                paramsVersion: 'p1',
                usage: { tokensCount: 1200, price: null },
            }),
            { force: true },
        );
        expect(cache.setJson).toHaveBeenCalledWith(
            DATA.requestKey,
            { status: 'ready', data: dto },
            expect.any(Number),
        );
        expect(ws.sendToClient).toHaveBeenCalledWith('s1', {
            event: AI_ANALYTICS_WS_EVENTS.OWNER_REPORT_DONE,
            data: {
                requestKey: DATA.requestKey,
                generatedAt: NOW.toISOString(),
            },
        });
    });

    it('квартал складывается из месячных снапшотов без похода за строками звонков', async () => {
        const monthFacts = (monthKey: string) =>
            buildOwnerReportFacts(
                [dated(call({ day: `${monthKey}-07` }))],
                period(`${monthKey}-01`, `${monthKey}-28`),
            );
        const { useCase, loader, reader, snapshots } = makeUseCase({
            monthly: (_domain, _kind, key) =>
                Promise.resolve(
                    ['2026-07', '2026-08', '2026-09'].includes(key)
                        ? { facts: monthFacts(key) }
                        : null,
                ),
        });
        const dto = await useCase.execute(
            {
                ...DATA,
                kind: 'quarter',
                periodKey: '2026-Q3',
                from: '2026-07-01',
                to: '2026-09-30',
            },
            NOW,
        );
        expect(loader.load).not.toHaveBeenCalled();
        expect(reader.payload).toHaveBeenCalledWith(
            DATA.domain,
            'month',
            '2026-08',
        );
        expect(dto.kind).toBe('quarter');
        const stored = snapshots.upsert.mock.calls[0][0] as {
            payload: {
                facts: {
                    composedOf?: string[];
                    coverage: { analyzed: number };
                };
            };
        };
        expect(stored.payload.facts.composedOf).toEqual([
            '2026-07',
            '2026-08',
            '2026-09',
        ]);
        expect(stored.payload.facts.coverage.analyzed).toBe(3);
        expect(dto.text.methodology.join(' ')).toContain(
            'собран из 3 месячных отчётов (июль, август, сентябрь 2026)',
        );
    });

    it('нет снапшота хотя бы за один месяц — квартал считается напрямую по звонкам', async () => {
        const { useCase, loader } = makeUseCase({
            monthly: (_domain, _kind, key) =>
                Promise.resolve(
                    key === '2026-08'
                        ? null
                        : {
                              facts: buildOwnerReportFacts(
                                  [dated(call({ day: `${key}-07` }))],
                                  period(`${key}-01`, `${key}-28`),
                              ),
                          },
                ),
        });
        await useCase.execute(
            {
                ...DATA,
                kind: 'quarter',
                periodKey: '2026-Q3',
                from: '2026-07-01',
                to: '2026-09-30',
            },
            NOW,
        );
        expect(loader.load).toHaveBeenCalledTimes(1);
    });

    it('модель недоступна — шаблон с причиной, отчёт всё равно готов', async () => {
        const { useCase } = makeUseCase({
            narrative: () => Promise.reject(new Error('нет ключа')),
        });
        const dto = await useCase.execute(DATA, NOW);
        expect(dto.source).toBe('template');
        expect(dto.narrativeReason).toBe('нет ключа');
        expect(dto.text.summarySource).toBe('template');
    });

    it('провал источников — error-конверт в кэш, WS error и rethrow', async () => {
        const { useCase, cache, ws, snapshots } = makeUseCase({
            sources: () => Promise.reject(new Error('Битрикс недоступен')),
        });
        await expect(useCase.execute(DATA, NOW)).rejects.toThrow(
            'Битрикс недоступен',
        );
        expect(snapshots.upsert).not.toHaveBeenCalled();
        expect(cache.setJson).toHaveBeenCalledWith(
            DATA.requestKey,
            { status: 'error', message: 'Битрикс недоступен' },
            expect.any(Number),
        );
        expect(ws.sendToClient).toHaveBeenCalledWith('s1', {
            event: AI_ANALYTICS_WS_EVENTS.OWNER_REPORT_ERROR,
            data: {
                requestKey: DATA.requestKey,
                message: 'Битрикс недоступен',
            },
        });
    });
});
