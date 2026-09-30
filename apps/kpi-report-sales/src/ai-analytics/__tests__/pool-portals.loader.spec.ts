import 'reflect-metadata';
import { AI_ANALYTICS_SNAPSHOT_TYPE } from '@lib/sales-ai-analytics';
import { PoolPortalsLoader } from '../domain/loaders/pool-portals.loader';
import { poolPortalKeyOf } from '../domain/loaders/pool-portals.facts';
import { snapshotHashKey } from '../store/snapshot-serialize.util';
import { portalSettings } from './fixtures/lite-row.fixture';
import {
    poolModelPayload,
    qualityLinkPayload,
    snapshotRecord as record,
} from './fixtures/pool.fixture';

/**
 * Входы пула порталов (Фаза 4, П17): только порталы с датированным
 * согласием, только из `ais`, обезличенно, запись месяца — не позже
 * расчётного. Разбор нагрузок — pool-portals.facts.spec.
 */
const DOMAINS = [
    'a.bitrix24.ru',
    'b.bitrix24.ru',
    'c.bitrix24.ru',
    'd.bitrix24.ru',
];

function loaderWith() {
    const settingsByDomain: Record<
        string,
        ReturnType<typeof portalSettings>
    > = {
        'a.bitrix24.ru': portalSettings({
            poolOptIn: true,
            poolConsentAt: '2026-01-15T10:00:00+03:00',
        }),
        'b.bitrix24.ru': portalSettings({
            poolOptIn: true,
            poolConsentAt: null,
        }),
        'c.bitrix24.ru': portalSettings({
            poolOptIn: false,
            poolConsentAt: '2026-01-15',
        }),
        'd.bitrix24.ru': portalSettings({
            poolOptIn: true,
            poolConsentAt: '2026-02-01',
        }),
    };
    const listDomains = jest.fn().mockResolvedValue(DOMAINS);
    const load = jest.fn().mockImplementation((domain: string) => {
        if (domain === 'd.bitrix24.ru') {
            return Promise.reject(new Error('настройки недоступны'));
        }

        return Promise.resolve(settingsByDomain[domain]);
    });
    // Записи по возрастанию времени записи: догон истории записал август
    // ПОСЛЕ сентября, а октябрь — будущее для пула сентября.
    const findByKeys = jest.fn().mockImplementation((_: string, type: string) =>
        Promise.resolve(
            type === AI_ANALYTICS_SNAPSHOT_TYPE.portalModel
                ? [
                      modelRecord('2026-09', 12),
                      modelRecord('2026-10', 11),
                      modelRecord('2026-08', 7),
                  ]
                : [
                      record('2026-09', qualityLinkPayload('estimated')),
                      record(
                          '2026-08',
                          qualityLinkPayload('estimated', {
                              value: 9,
                              se: 1,
                          }),
                      ),
                  ],
        ),
    );
    const loader = new PoolPortalsLoader(
        { listDomains } as never,
        { load } as never,
        { findByKeys } as never,
    );

    return { loader, load, findByKeys };
}

const modelRecord = (periodKey: string, historyMonths: number) =>
    record(periodKey, poolModelPayload({ readiness: { historyMonths } }));

describe('PoolPortalsLoader — входы пула из ais', () => {
    it('читает только порталы с флагом и датой согласия; сбой портала не роняет пул', async () => {
        const { loader, load, findByKeys } = loaderWith();
        const inputs = await loader.load('2026-09');
        expect(load).toHaveBeenCalledTimes(4);
        expect(findByKeys).toHaveBeenCalledTimes(2);
        expect(findByKeys).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            AI_ANALYTICS_SNAPSHOT_TYPE.qualityLink,
            expect.objectContaining({ managerIds: [null], latestOnly: true }),
        );
        expect(inputs).toHaveLength(1);
        expect(inputs[0].portalKey).toBe(snapshotHashKey(['a.bitrix24.ru']));
        expect(inputs[0].consentAt).toBe('2026-01-15');
    });

    it('месяц записи — не позже расчётного, а не последняя записанная', async () => {
        const { loader } = loaderWith();
        const [input] = await loader.load('2026-09');
        expect(input.historyMonths).toBe(12);
        expect(input.beta?.value).toBe(0.3);
        const [august] = await loader.load('2026-08');
        expect(august.historyMonths).toBe(7);
        expect(august.beta?.value).toBe(9);
        const [none] = await loader.load('2026-07');
        expect(none.historyMonths).toBe(0);
        expect(none.beta).toBeNull();
    });

    it('обезличенно: домена в результате нет, ключ — 16 hex', async () => {
        const { loader } = loaderWith();
        const inputs = await loader.load('2026-09');
        const text = JSON.stringify(inputs);
        DOMAINS.forEach(domain => expect(text).not.toContain(domain));
        expect(poolPortalKeyOf('a.bitrix24.ru')).toMatch(/^[0-9a-f]{16}$/);
    });

    it('порядок детерминирован — по обезличенному ключу', async () => {
        const { loader, load } = loaderWith();
        load.mockImplementation(() =>
            Promise.resolve(
                portalSettings({
                    poolOptIn: true,
                    poolConsentAt: '2026-01-01',
                }),
            ),
        );
        const keys = (await loader.load('2026-09')).map(
            input => input.portalKey,
        );
        expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)));
        expect(keys).toHaveLength(4);
    });
});
