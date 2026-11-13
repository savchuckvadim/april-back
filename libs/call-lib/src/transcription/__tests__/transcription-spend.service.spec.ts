import { Logger } from '@nestjs/common';
import type { VendorSettingsReader } from '@lib/vendor-settings';
import type {
    SpendAggregateRow,
    SpendCallRow,
    SpendGroupBy,
    SpendSlice,
    TranscriptionSpendRepository,
} from '../repository/transcription-spend.repository';
import { TranscriptionSpendService } from '../services/transcription-spend.service';

const NOW = new Date('2026-11-13T12:00:00Z');

const row = (
    key: string,
    provider: string,
    calls: number,
    sec: number,
    label: string | null = null,
): SpendAggregateRow => ({
    key,
    label,
    provider,
    calls,
    knownSec: sec,
    billedSec: sec,
    unknownCalls: 0,
});

function setup(options: {
    byGroup?: Partial<Record<SpendGroupBy, SpendAggregateRow[]>>;
    previous?: SpendAggregateRow[];
    calls?: SpendCallRow[];
    price?: string | null | Error;
    portalIds?: Map<string, number>;
}) {
    const aggregate = jest.fn(
        (
            slice: SpendSlice,
            groupBy: SpendGroupBy,
        ): Promise<SpendAggregateRow[]> => {
            const isPrevious = slice.from.getTime() < Date.UTC(2026, 9, 31, 21);
            if (isPrevious) return Promise.resolve(options.previous ?? []);
            return Promise.resolve(options.byGroup?.[groupBy] ?? []);
        },
    );
    const repository = {
        aggregate,
        longestYandexCalls: jest.fn().mockResolvedValue(options.calls ?? []),
        portalIds: jest
            .fn()
            .mockResolvedValue(options.portalIds ?? new Map<string, number>()),
    } as unknown as TranscriptionSpendRepository;
    const price = options.price === undefined ? null : options.price;
    const settings: VendorSettingsReader = {
        get: () =>
            price instanceof Error
                ? Promise.reject(price)
                : Promise.resolve(price),
        getMany: () => Promise.resolve({}),
    };
    const service = new TranscriptionSpendService(
        repository,
        { get: () => undefined } as never,
        settings,
    );
    return { service, aggregate, repository };
}

describe('TranscriptionSpendService — расход на распознавание', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });
    afterEach(() => jest.restoreAllMocks());

    it('сводка: порталы — самые дорогие первыми, при равенстве — по звонкам; id портала для ссылки', async () => {
        const { service } = setup({
            byGroup: {
                domain: [
                    row('free.bitrix24.ru', 'bitrix-vibecode', 50, 6000),
                    row('cheap.bitrix24.ru', 'yandex', 1, 60),
                    row('rich.bitrix24.ru', 'yandex', 10, 6000),
                    row('rich.bitrix24.ru', 'bitrix-vibecode', 5, 300),
                ],
            },
            portalIds: new Map([['rich.bitrix24.ru', 7]]),
        });

        const summary = await service.summary('2026-11', NOW);

        expect(summary.month).toBe('2026-11');
        expect(summary.kopecksPerMinute).toBe(60);
        expect(summary.portals.map(p => p.domain)).toEqual([
            'rich.bitrix24.ru',
            'cheap.bitrix24.ru',
            'free.bitrix24.ru',
        ]);
        expect(summary.portals[0]).toMatchObject({
            portalId: 7,
            totals: { calls: 15, rub: 60, yandexCalls: 10 },
        });
        expect(summary.portals[2].portalId).toBeNull();
        expect(summary.totals).toMatchObject({ calls: 66, rub: 60.6 });
    });

    it('цена минуты — из настроек; мусор или сбой чтения — 60 копеек', async () => {
        const rows = { domain: [row('a.bitrix24.ru', 'yandex', 1, 600)] };
        expect(
            (
                await setup({ byGroup: rows, price: '15' }).service.summary(
                    '2026-11',
                    NOW,
                )
            ).totals.rub,
        ).toBe(1.5);
        expect(
            (
                await setup({ byGroup: rows, price: 'дорого' }).service.summary(
                    '2026-11',
                    NOW,
                )
            ).kopecksPerMinute,
        ).toBe(60);
        const failing = await setup({
            byGroup: rows,
            price: new Error('нет базы'),
        }).service.summary('2026-11', NOW);
        expect(failing.totals.rub).toBe(6);
    });

    it('портал: дни по порядку, сотрудники — самые дорогие первыми, прошлый месяц отдельно', async () => {
        const { service, aggregate } = setup({
            byGroup: {
                domain: [
                    row('a', 'yandex', 2, 1200),
                    row('a', 'bitrix-vibecode', 4, 400),
                ],
                day: [
                    row('2026-11-12', 'yandex', 1, 600),
                    row('2026-11-03', 'yandex', 1, 600),
                    row('2026-11-03', 'bitrix-vibecode', 4, 400),
                ],
                user: [
                    row('11', 'bitrix-vibecode', 4, 400, 'Петров'),
                    row('22', 'yandex', 2, 1200, 'Иванова'),
                    row('', 'yandex', 0, 0),
                ],
            },
            previous: [row('a', 'yandex', 1, 60)],
            calls: [
                {
                    id: '5',
                    createdAt: null,
                    durationSec: 10,
                    userName: null,
                    entityType: null,
                    entityId: null,
                    entityName: null,
                },
            ],
        });

        const portal = await service.portal('a.bitrix24.ru', '2026-11', NOW);

        expect(aggregate).toHaveBeenCalledWith(
            expect.objectContaining({ domain: 'a.bitrix24.ru' }),
            'user',
        );
        expect(portal.totals).toMatchObject({ calls: 6, rub: 12 });
        expect(portal.previousTotals).toMatchObject({ calls: 1, rub: 0.6 });
        expect(portal.days.map(d => d.day)).toEqual([
            '2026-11-03',
            '2026-11-12',
        ]);
        expect(portal.users.map(u => [u.userId, u.userName])).toEqual([
            ['22', 'Иванова'],
            ['11', 'Петров'],
            // Звонки без сотрудника — отдельной строкой без имени.
            [null, null],
        ]);
        // Звонок короче 15 секунд — как 15 секунд.
        expect(portal.topCalls[0].rub).toBe(0.15);
    });
});
