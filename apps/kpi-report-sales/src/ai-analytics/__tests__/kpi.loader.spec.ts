import { KpiLoader } from '../domain/loaders/kpi.loader';
import type { AiKpiMonth } from '../domain/loaders/kpi.types';
import { buildKpiMonthKey } from '../domain/loaders/loader-cache-key.util';
import { CALL_DONE_MERGED_EVENT_TYPE_CODES } from '../domain/loaders/kpi-month.assembler';
import { IncompleteBatchError } from '../../shared/lib/batch-completeness.util';
import {
    apiMock,
    cacheMock,
    managersMock,
    pbxMock,
    PER_TYPE_TOTALS,
} from './fixtures/kpi-loader.fixture';

/** «Сейчас» — 6 сентября 2026 (локальные компоненты, как в splitIntoMonthSegments). */
const NOW = new Date(2026, 8, 6, 12, 0, 0);
const DOMAIN = 'example.bitrix24.ru';

const PER_TYPE_KEY = /^user_\d+_type_/;

function cachedMonth(overrides: Partial<AiKpiMonth>): AiKpiMonth {
    return {
        month: '2026-08',
        from: '2026-08-01',
        to: '2026-08-31',
        closed: true,
        fromCache: false,
        managers: [],
        ...overrides,
    };
}

function makeLoader(
    options: { dropKeys?: string[]; preset?: Record<string, unknown> } = {},
) {
    const api = apiMock(options.dropKeys);
    const pbx = pbxMock(api);
    const cache = cacheMock(options.preset);
    const managers = managersMock();
    const loader = new KpiLoader(pbx.service, cache.service, managers.loader);
    return { loader, api, pbx, cache, managers };
}

describe('KpiLoader', () => {
    it('режет период на месяцы: неполный июль и текущий сентябрь — 180 с, закрытый август — 30 дней', async () => {
        const { loader, cache } = makeLoader();

        const result = await loader.loadKpiMonths(
            DOMAIN,
            '2026-07-15',
            '2026-09-06',
            [1, 2],
            { now: NOW },
        );

        expect(result.managerIds).toEqual([1, 2]);
        expect(
            result.months.map(m => [m.month, m.from, m.to, m.closed]),
        ).toEqual([
            ['2026-07', '2026-07-15', '2026-07-31', false],
            ['2026-08', '2026-08-01', '2026-08-31', true],
            ['2026-09', '2026-09-01', '2026-09-06', false],
        ]);
        const ttlByKey = new Map(
            cache.setJson.mock.calls.map(call => [call[0], call[2]] as const),
        );
        expect(
            ttlByKey.get(
                `sales-ai-analytics:v1:${DOMAIN}:kpi-month:2026-08:1_2`,
            ),
        ).toBe(30 * 24 * 3600);
        expect(
            ttlByKey.get(
                `sales-ai-analytics:v1:${DOMAIN}:kpi-month:2026-07:1_2:2026-07-15_2026-07-31`,
            ),
        ).toBe(180);
        expect(
            ttlByKey.get(
                `sales-ai-analytics:v1:${DOMAIN}:kpi-month:2026-09:1_2:2026-09-01_2026-09-06`,
            ),
        ).toBe(180);
    });

    it('закрытый месяц берётся из кэша: Bitrix не дёргается, fromCache = true', async () => {
        const key = buildKpiMonthKey(
            DOMAIN,
            {
                from: '2026-08-01',
                to: '2026-08-31',
                month: '2026-08',
                cacheable: true,
            },
            '1_2',
        );
        const { loader, pbx, api } = makeLoader({
            preset: { [key]: cachedMonth({ managers: [] }) },
        });

        const result = await loader.loadKpiMonths(
            DOMAIN,
            '2026-08-01',
            '2026-08-31',
            [1, 2],
            { now: NOW },
        );

        expect(result.months).toHaveLength(1);
        expect(result.months[0].fromCache).toBe(true);
        expect(pbx.init).not.toHaveBeenCalled();
        expect(api.callBatchWithConcurrency).not.toHaveBeenCalled();
    });

    it('калькулятор создаётся один раз на вызов (2 pbx.init: kpi-report + per-type), кэш не читается при forceRefresh', async () => {
        const key = buildKpiMonthKey(
            DOMAIN,
            {
                from: '2026-08-01',
                to: '2026-08-31',
                month: '2026-08',
                cacheable: true,
            },
            '1_2',
        );
        const { loader, pbx, cache } = makeLoader({
            preset: { [key]: cachedMonth({}) },
        });

        const result = await loader.loadKpiMonths(
            DOMAIN,
            '2026-07-15',
            '2026-09-06',
            [1, 2],
            { now: NOW, forceRefresh: true },
        );

        expect(cache.getJson).not.toHaveBeenCalled();
        expect(result.months.every(m => !m.fromCache)).toBe(true);
        expect(pbx.init).toHaveBeenCalledTimes(2);
        expect(cache.setJson).toHaveBeenCalledTimes(3);
    });

    it('per-type факты: строки kpi-report + strict-батч по кодам, слитым в call_done; суммы ≤ call_done', async () => {
        const { loader, api } = makeLoader();

        const result = await loader.loadKpiMonths(
            DOMAIN,
            '2026-08-01',
            '2026-08-31',
            [1, 2],
            { now: NOW },
        );

        const [manager1, manager2] = result.months[0].managers;
        expect(manager1.managerId).toBe(1);
        expect(manager1.calls).toEqual({ plan: 12, done: 10 });
        expect(manager1.presentations).toEqual({ plan: 8, done: 7 });
        expect(manager1.presentationsUniq).toEqual({ plan: 6, done: 5 });
        expect(manager1.documents.offers).toBe(3);
        expect(manager1.documents.invoices).toBe(2);
        expect(manager1.outcomes).toEqual({ success: 2, fail: 1 });

        // per-type
        expect(manager1.byType.cold.kpi).toEqual([{ code: 'xo', done: 3 }]);
        expect(manager1.byType.cold.primaryDone).toBe(3);
        expect(manager1.byType.site_lead.primaryDone).toBe(5);
        expect(manager1.byType.call.kpi).toEqual([
            { code: 'call', done: 4 },
            { code: 'come_call', done: 1 },
        ]);
        expect(manager1.byType.call.primaryDone).toBe(4);
        expect(manager1.byType.decision.primaryDone).toBe(2);
        expect(manager1.byType.payment.kpi).toEqual([
            { code: 'call_in_money', done: 1 },
            { code: 'ev_success', done: 2 },
        ]);
        // презентации — из строк kpi-report, канон presentation_uniq
        expect(manager1.byType.presentation.primaryDone).toBe(5);
        expect(manager1.byType.presentation.kpi).toHaveLength(3);
        // refine — факта нет с причиной карты
        expect(manager1.byType.refine).toEqual({
            kind: 'refine',
            kpi: [],
            primaryDone: null,
            reason: 'refine-mapped-to-call',
        });
        expect(manager1.byType.other.primaryDone).toBeNull();

        // суммы per-type по слитым кодам не превышают call_done (здесь равны)
        for (const manager of [manager1, manager2]) {
            expect(manager.checks.perTypeCallDone).toBeLessThanOrEqual(
                manager.checks.callDone,
            );
            expect(manager.checks.perTypeCallDone).toBe(
                manager.checks.callDone,
            );
        }
        expect(manager2.checks).toEqual({ perTypeCallDone: 20, callDone: 20 });

        // батч: по 6 команд на менеджера (4 слитых + site + come_call), strict
        const perTypeCalls = api.addCmdBatch.mock.calls.filter(call =>
            PER_TYPE_KEY.test(String(call[0])),
        );
        expect(perTypeCalls).toHaveLength(
            2 * Object.keys(PER_TYPE_TOTALS).length,
        );
        const perTypeCodes = perTypeCalls
            .map(call => String(call[0]))
            .filter(key => key.startsWith('user_1_'))
            .map(key => key.replace('user_1_type_', '').replace(/_done$/, ''));
        expect(perTypeCodes.sort()).toEqual(
            [...CALL_DONE_MERGED_EVENT_TYPE_CODES, 'site', 'come_call'].sort(),
        );
        expect(api.callBatchWithConcurrency).toHaveBeenCalledWith(1, {
            strict: true,
        });
        // фильтр как в kpi-report: bitrixCamelId, bitrixId элементов, даты DD.MM.YYYY
        const xoCommand = perTypeCalls.find(
            call => call[0] === 'user_1_type_xo_done',
        ) as unknown[];
        expect(xoCommand[1]).toBe('lists.element.get');
        expect(xoCommand[2]).toEqual({
            IBLOCK_TYPE_ID: 'lists',
            IBLOCK_ID: '55',
            filter: {
                PROPERTY_102: '1',
                PROPERTY_100: 12,
                PROPERTY_101: 21,
                '>PROPERTY_103': '01.08.2026',
                '<PROPERTY_103': '01.09.2026',
            },
            select: ['ID'],
        });
    });

    it('managerIds нормализуются и ограничивают выборку; без них — ростер', async () => {
        const explicit = makeLoader();
        const result = await explicit.loader.loadKpiMonths(
            DOMAIN,
            '2026-08-01',
            '2026-08-31',
            ['2', 1, 1, 0],
            { now: NOW },
        );
        expect(result.managerIds).toEqual([1, 2]);
        const users = new Set(
            explicit.api.addCmdBatch.mock.calls.map(
                call => String(call[0]).split('_')[1],
            ),
        );
        expect([...users].sort()).toEqual(['1', '2']);

        const roster = makeLoader();
        const fromRoster = await roster.loader.loadKpiMonths(
            DOMAIN,
            '2026-08-01',
            '2026-08-31',
            undefined,
            { now: NOW },
        );
        expect(roster.managers.resolve).toHaveBeenCalledWith(DOMAIN, undefined);
        expect(fromRoster.managerIds).toEqual([7, 8]);
        expect(fromRoster.months[0].managers.map(m => m.managerId)).toEqual([
            7, 8,
        ]);
    });

    it('пропавшая команда per-type батча роняет расчёт (IncompleteBatchError), кэш не пишется', async () => {
        const { loader, cache } = makeLoader({
            dropKeys: ['user_2_type_call_done'],
        });

        await expect(
            loader.loadKpiMonths(DOMAIN, '2026-08-01', '2026-08-31', [1, 2], {
                now: NOW,
            }),
        ).rejects.toBeInstanceOf(IncompleteBatchError);
        expect(cache.setJson).not.toHaveBeenCalled();
    });
});
