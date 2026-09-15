import type { PBXService } from '@/modules/pbx';
import type { AiAnalyticsCacheService } from '../cache/ai-analytics-cache.service';
import type { ManagersLoader } from '../domain/loaders/managers.loader';
import { buildStyleCrmMonthKey } from '../domain/loaders/style-crm.cache';
import { StyleCrmLoader } from '../domain/loaders/style-crm.loader';

/** Ответ телефонии: один разговор и один недозвон по лиду 1. */
const VOX_PAGE = {
    result: [
        {
            PORTAL_USER_ID: '7',
            CALL_TYPE: '1',
            CALL_DURATION: '0',
            CALL_FAILED_CODE: '603-S',
            CALL_START_DATE: '2026-08-03T10:00:00+03:00',
            CRM_ENTITY_TYPE: 'LEAD',
            CRM_ENTITY_ID: '1',
        },
        {
            PORTAL_USER_ID: '7',
            CALL_TYPE: '1',
            CALL_DURATION: '120',
            CALL_FAILED_CODE: '200',
            CALL_START_DATE: '2026-08-04T10:00:00+03:00',
            CRM_ENTITY_TYPE: 'LEAD',
            CRM_ENTITY_ID: '1',
        },
    ],
};

const LEAD_PAGE = {
    result: [
        {
            ID: '1',
            ASSIGNED_BY_ID: '7',
            DATE_CREATE: '2026-08-03T09:00:00+03:00',
        },
    ],
};

interface Harness {
    loader: StyleCrmLoader;
    inits: string[];
    methods: string[];
    cacheWrites: { key: string; ttl: number }[];
    cache: Map<string, unknown>;
}

function harness(cached: Record<string, unknown> = {}): Harness {
    const inits: string[] = [];
    const methods: string[] = [];
    const cacheWrites: { key: string; ttl: number }[] = [];
    const cache = new Map<string, unknown>(Object.entries(cached));

    const bitrix = {
        api: {
            call: (method: string) => {
                methods.push(method);
                return Promise.resolve(
                    method === 'crm.lead.list' ? LEAD_PAGE : VOX_PAGE,
                );
            },
        },
    };
    const pbx = {
        init: (domain: string) => {
            inits.push(domain);
            return Promise.resolve({ bitrix });
        },
    } as unknown as PBXService;
    const cacheService = {
        getJson: <T>(key: string): Promise<T | null> =>
            Promise.resolve((cache.get(key) as T) ?? null),
        setJson: (key: string, value: unknown, ttl: number) => {
            cacheWrites.push({ key, ttl });
            cache.set(key, value);
            return Promise.resolve();
        },
    } as unknown as AiAnalyticsCacheService;
    const managers = {
        resolve: (_domain: string, ids?: readonly (string | number)[]) =>
            Promise.resolve(ids ? ids.map(Number) : [7]),
    } as unknown as ManagersLoader;

    return {
        loader: new StyleCrmLoader(pbx, cacheService, managers),
        inits,
        methods,
        cacheWrites,
        cache,
    };
}

const NOW = new Date('2026-09-14T10:00:00Z');

describe('StyleCrmLoader', () => {
    it('считает счётчики месяца по телефонии и лидам и пишет закрытый месяц надолго', async () => {
        const h = harness();

        const result = await h.loader.load(
            'portal.bitrix24.ru',
            '2026-08-01',
            '2026-08-31',
            [7],
            { now: NOW },
        );

        expect(h.inits).toEqual(['portal.bitrix24.ru']);
        expect(h.methods).toContain('voximplant.statistic.get');
        expect(h.methods).toContain('crm.lead.list');
        const manager = result.managers[0];
        expect(manager.managerId).toBe('7');
        // Разговор со второй попытки; событие «первая попытка без
        // разговора» закрыто повтором на следующий рабочий день.
        expect(manager.units.attemptsPerLead).toEqual([2]);
        expect(manager.giveUpEvents).toBe(1);
        expect(manager.giveUps).toBe(0);
        expect(manager.giveUpRate).toBe(0);
        // Лид создан в 09:00, первый звонок в 10:00 того же рабочего дня.
        expect(manager.leadResponseMinMedian).toBe(60);
        expect(manager.conversationSecMedian).toBe(120);
        expect(result.truncated).toBe(false);
        // Август закрыт — кэш на 30 дней.
        expect(h.cacheWrites).toHaveLength(1);
        expect(h.cacheWrites[0].ttl).toBe(60 * 60 * 24 * 30);
    });

    it('попадание в кэш: Bitrix не дёргается вообще', async () => {
        const key = buildStyleCrmMonthKey(
            'portal.bitrix24.ru',
            {
                from: '2026-08-01',
                to: '2026-08-31',
                month: '2026-08',
                cacheable: true,
            },
            '7',
        );
        const h = harness({
            [key]: {
                month: '2026-08',
                from: '2026-08-01',
                to: '2026-08-31',
                cacheable: true,
                truncated: false,
                managers: [],
            },
        });

        const result = await h.loader.load(
            'portal.bitrix24.ru',
            '2026-08-01',
            '2026-08-31',
            [7],
            { now: NOW },
        );

        expect(h.inits).toEqual([]);
        expect(h.methods).toEqual([]);
        expect(result.months[0].fromCache).toBe(true);
        expect(h.cacheWrites).toEqual([]);
    });

    it('forceRefresh обходит чтение кэша и перезаписывает его', async () => {
        const key = buildStyleCrmMonthKey(
            'portal.bitrix24.ru',
            {
                from: '2026-08-01',
                to: '2026-08-31',
                month: '2026-08',
                cacheable: true,
            },
            '7',
        );
        const h = harness({ [key]: { managers: [] } });

        await h.loader.load(
            'portal.bitrix24.ru',
            '2026-08-01',
            '2026-08-31',
            [7],
            { now: NOW, forceRefresh: true },
        );

        expect(h.inits).toEqual(['portal.bitrix24.ru']);
        expect(h.cacheWrites.map(write => write.key)).toEqual([key]);
    });

    it('пустой ростер — ни одного вызова Bitrix и пустые счётчики', async () => {
        const h = harness();

        const result = await h.loader.load(
            'portal.bitrix24.ru',
            '2026-08-01',
            '2026-08-31',
            [],
            { now: NOW },
        );

        expect(h.inits).toEqual([]);
        expect(result.managers).toEqual([]);
    });
});
