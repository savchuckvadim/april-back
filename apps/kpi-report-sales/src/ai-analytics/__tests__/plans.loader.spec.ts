import { PlansLoader, toManagerTargets } from '../domain/loaders/plans.loader';
import { buildPlansKey } from '../domain/loaders/loader-cache-key.util';
import type { AiPlansResult } from '../domain/loaders/plans.types';
import {
    PLAN_INDICATOR_CODE_LIST,
    PLAN_INDICATOR_CODES,
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

function makeLoader(userGet: jest.Mock, preset: Record<string, unknown> = {}) {
    const init = jest
        .fn()
        .mockResolvedValue({ bitrix: { user: { get: userGet } } });
    const cache = cacheMock(preset);
    const managers = managersMock();
    const loader = new PlansLoader(
        { init } as never,
        cache.service,
        managers.loader,
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

    it('попадание в кэш — Bitrix не дёргается, fromCache = true', async () => {
        const cached: AiPlansResult = {
            managerIds: [1],
            fromCache: false,
            ok: true,
            error: null,
            managers: [toManagerTargets(1, undefined)],
        };
        const { loader, init } = makeLoader(jest.fn(), {
            [buildPlansKey(DOMAIN, '1')]: cached,
        });

        const result = await loader.loadPlans(DOMAIN, [1]);

        expect(init).not.toHaveBeenCalled();
        expect(result.fromCache).toBe(true);
        expect(result.managers[0].managerId).toBe(1);
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
        expect(result.managers).toEqual([toManagerTargets(3, undefined)]);
        expect(cache.setJson).not.toHaveBeenCalled();
    });
});
