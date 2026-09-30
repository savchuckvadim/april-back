import { PlansLoader, toManagerTargets } from '../domain/loaders/plans.loader';
import { buildPlansKey } from '../domain/loaders/loader-cache-key.util';
import type { AiPlansResult } from '../domain/loaders/plans.types';
import {
    PLAN_INDICATOR_CODE_LIST,
    PLAN_INDICATOR_CODES,
    PLAN_INDICATORS,
    planIndicatorUfName,
} from '../../plans';
import { cacheMock, managersMock } from './fixtures/kpi-loader.fixture';

const DOMAIN = 'example.bitrix24.ru';

function userRow(id: number, values: Partial<Record<string, unknown>>) {
    return {
        ID: String(id),
        ...Object.fromEntries(
            Object.entries(values).map(([code, value]) => [
                planIndicatorUfName(code as never),
                value,
            ]),
        ),
    };
}

/** Строка-сентинел конфига планов: презентации — на квартал, «План продаж». */
const STORED_CONFIG = {
    version: 1,
    updatedAt: '2026-09-01T00:00:00.000Z',
    config: {
        version: 1,
        indicators: [
            {
                code: PLAN_INDICATOR_CODES.presentations_done,
                enabled: true,
                customName: 'Презентации РОПа',
                periodType: 'quarter',
            },
            {
                code: PLAN_INDICATOR_CODES.sales_count,
                enabled: true,
                customName: null,
                periodType: 'month',
            },
        ],
    },
};

/** Prisma для PlansConfigService: портал + строка конфига (или ошибка). */
function prismaMock(options: { fail?: boolean } = {}) {
    return {
        portal: {
            findFirst: options.fail
                ? jest.fn().mockRejectedValue(new Error('DB down'))
                : jest.fn().mockResolvedValue({ id: 7, domain: DOMAIN }),
        },
        report_settings: {
            findFirst: jest.fn().mockResolvedValue({
                id: 1,
                other: JSON.stringify(STORED_CONFIG),
            }),
        },
    };
}

function makeLoader(
    userGet: jest.Mock,
    preset: Record<string, unknown> = {},
    prisma = prismaMock(),
) {
    const init = jest
        .fn()
        .mockResolvedValue({ bitrix: { user: { get: userGet } } });
    const cache = cacheMock(preset);
    const managers = managersMock();
    const loader = new PlansLoader(
        { init } as never,
        cache.service,
        managers.loader,
        prisma as never,
    );
    return { loader, init, cache, managers };
}

describe('PlansLoader', () => {
    it('планы из UF-полей: ключевые цели + весь каталог, пусто → null; кэш 1 час', async () => {
        const userGet = jest.fn().mockResolvedValue({
            result: [
                userRow(1, {
                    [PLAN_INDICATOR_CODES.sales_count]: '5',
                    [PLAN_INDICATOR_CODES.calls_done]: 400,
                    [PLAN_INDICATOR_CODES.presentations_done]: '',
                }),
            ],
        });
        const { loader, cache } = makeLoader(userGet);

        const result = await loader.loadPlans(DOMAIN, ['2', 1]);

        expect(result.ok).toBe(true);
        expect(result.managerIds).toEqual([1, 2]);
        expect(userGet).toHaveBeenCalledTimes(1);
        const [manager1, manager2] = result.managers;
        expect(manager1).toMatchObject({
            managerId: 1,
            sales: 5,
            calls: 400,
            presentations: null,
        });
        expect(Object.keys(manager1.targets).sort()).toEqual(
            [...PLAN_INDICATOR_CODE_LIST].sort(),
        );
        expect(manager1.targets[PLAN_INDICATOR_CODES.offers_sent]).toBeNull();
        // менеджера 2 в ответе Bitrix нет — все цели null
        expect(manager2.sales).toBeNull();
        expect(Object.values(manager2.targets).every(v => v === null)).toBe(
            true,
        );
        expect(cache.setJson).toHaveBeenCalledWith(
            buildPlansKey(DOMAIN, '1_2'),
            expect.objectContaining({ ok: true }),
            3600,
        );
    });

    it('конфиг планов портала: весь каталог, сохранённое поверх дефолтов; строки несут его же', async () => {
        const { loader } = makeLoader(
            jest.fn().mockResolvedValue({ result: [] }),
        );

        const result = await loader.loadPlans(DOMAIN, [1]);

        expect(result.config).toHaveLength(PLAN_INDICATORS.length);
        expect(
            result.config?.find(
                item => item.code === PLAN_INDICATOR_CODES.presentations_done,
            ),
        ).toEqual({
            code: PLAN_INDICATOR_CODES.presentations_done,
            enabled: true,
            customName: 'Презентации РОПа',
            periodType: 'quarter',
        });
        // невключённый в сохранённом конфиге показатель — выключен, месяц
        expect(
            result.config?.find(
                item => item.code === PLAN_INDICATOR_CODES.calls_done,
            ),
        ).toMatchObject({ enabled: false, periodType: 'month' });
        expect(result.managers[0].config).toEqual(result.config);
    });

    it('попадание в кэш — Bitrix не дёргается, fromCache = true', async () => {
        const cached: AiPlansResult = {
            managerIds: [1],
            fromCache: false,
            ok: true,
            error: null,
            config: [],
            managers: [toManagerTargets(1, undefined, [])],
        };
        const { loader, init } = makeLoader(jest.fn(), {
            [buildPlansKey(DOMAIN, '1')]: cached,
        });

        const result = await loader.loadPlans(DOMAIN, [1]);

        expect(init).not.toHaveBeenCalled();
        expect(result.fromCache).toBe(true);
        expect(result.managers[0].managerId).toBe(1);
    });

    it('запись кэша старой формы (без конфига) не отдаётся — планы перечитываются', async () => {
        const stale: AiPlansResult = {
            managerIds: [1],
            fromCache: false,
            ok: true,
            error: null,
            managers: [toManagerTargets(1, undefined)],
        };
        const userGet = jest.fn().mockResolvedValue({ result: [] });
        const { loader } = makeLoader(userGet, {
            [buildPlansKey(DOMAIN, '1')]: stale,
        });

        const result = await loader.loadPlans(DOMAIN, [1]);

        expect(userGet).toHaveBeenCalledTimes(1);
        expect(result.fromCache).toBe(false);
        expect(Array.isArray(result.config)).toBe(true);
    });

    it('ошибка конфига — fail-open: цели есть, config = null, кэш не пишется', async () => {
        const userGet = jest.fn().mockResolvedValue({
            result: [userRow(1, { [PLAN_INDICATOR_CODES.sales_count]: 3 })],
        });
        const { loader, cache } = makeLoader(
            userGet,
            {},
            prismaMock({ fail: true }),
        );

        const result = await loader.loadPlans(DOMAIN, [1]);

        expect(result.ok).toBe(true);
        expect(result.config).toBeNull();
        expect(result.managers[0].sales).toBe(3);
        expect(result.managers[0].config).toBeUndefined();
        expect(cache.setJson).not.toHaveBeenCalled();
    });

    it('ошибка Bitrix — fail-open: ok=false, error, цели null, кэш не пишется', async () => {
        const userGet = jest.fn().mockRejectedValue(new Error('ACCESS_DENIED'));
        const { loader, cache } = makeLoader(userGet);

        const result = await loader.loadPlans(DOMAIN, [3], {
            forceRefresh: true,
        });

        expect(cache.getJson).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            ok: false,
            error: 'ACCESS_DENIED',
            fromCache: false,
        });
        expect(result.managers[0]).toMatchObject(
            toManagerTargets(3, undefined),
        );
        expect(cache.setJson).not.toHaveBeenCalled();
    });
});
