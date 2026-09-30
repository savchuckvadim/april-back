import { BriefOverviewReader } from '../brief/brief-overview.reader';
import {
    buildManagerScopeKey,
    buildOverviewKey,
} from '../cache/cache-key.util';
import { buildManagersKey } from '../domain/loaders/loader-cache-key.util';
import { cacheMock } from './fixtures/kpi-loader.fixture';
import { callsOf, overviewFixture } from './fixtures/overview.fixture';

const DOMAIN = 'april.bitrix24.ru';
const PERIOD = { from: '2026-08-10', to: '2026-09-06' };
const keyOf = (usersKey: string) =>
    buildOverviewKey(DOMAIN, PERIOD.from, PERIOD.to, usersKey, false);

describe('BriefOverviewReader: обзор окна по периметру вкладки AI', () => {
    it('периметр без фильтра — опубликованный резолвером (список разбора), главнее ростера ОП', async () => {
        const cache = cacheMock({
            [buildManagerScopeKey(DOMAIN)]: [512, 10],
            [buildManagersKey(DOMAIN)]: [10, 20, 30],
        });

        await expect(
            new BriefOverviewReader(cache.service).roster(DOMAIN),
        ).resolves.toEqual([10, 512]);
    });

    it('периметр не опубликован — кэшированный ростер ОП; нет ничего — пусто', async () => {
        const withRoster = cacheMock({ [buildManagersKey(DOMAIN)]: [20, 10] });
        const empty = cacheMock();

        await expect(
            new BriefOverviewReader(withRoster.service).roster(DOMAIN),
        ).resolves.toEqual([10, 20]);
        await expect(
            new BriefOverviewReader(empty.service).roster(DOMAIN),
        ).resolves.toEqual([]);
    });

    it('ключ окна совпадает с ключом страницы обзора; пустой периметр — маркер none', () => {
        const reader = new BriefOverviewReader(cacheMock().service);

        expect(reader.key(DOMAIN, PERIOD, [20, 10])).toBe(keyOf('10_20'));
        expect(reader.key(DOMAIN, PERIOD, [])).toBe(keyOf('none'));
    });

    it('промах своего ключа — обзор периметра без фильтра, если в нём есть все менеджеры резюме', async () => {
        const shared = overviewFixture(callsOf('10', 10), [10, 512]);
        const cache = cacheMock({
            [buildManagerScopeKey(DOMAIN)]: [10, 512],
            [keyOf('10_512')]: { status: 'ready', data: shared },
        });
        const reader = new BriefOverviewReader(cache.service);

        await expect(reader.read(DOMAIN, PERIOD, [10])).resolves.toBe(shared);
        // Менеджера 20 в обзоре нет — числа резюме потеряли бы человека.
        await expect(reader.read(DOMAIN, PERIOD, [10, 20])).resolves.toBeNull();
    });
});
