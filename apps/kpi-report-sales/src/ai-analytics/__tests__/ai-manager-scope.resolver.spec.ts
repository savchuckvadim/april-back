import { buildManagerScopeKey } from '../cache/cache-key.util';
import { AI_ANALYTICS_MANAGERS_TTL_SECONDS } from '../domain/loaders/loader-cache-key.util';
import {
    callReportWith,
    scopeResolverWith,
} from './fixtures/manager-scope.fixture';

const DOMAIN = 'april.bitrix24.ru';

describe('AiManagerScopeResolver: периметр вкладки AI', () => {
    it('resolve читает список разбора из настроек портала и сужает фильтр', async () => {
        const { resolver, roster } = scopeResolverWith([10, 20, 30], {
            callReport: callReportWith([10]),
        });

        await expect(resolver.resolve(DOMAIN, [30, 10])).resolves.toEqual({
            managerIds: [10],
            pilotActive: true,
            hiddenByPilot: 1,
            empty: false,
        });
        // Явный фильтр — ростер ОП не нужен.
        expect(roster).not.toHaveBeenCalled();
    });

    it('без фильтра при действующем списке — список разбора, ростер не читается', async () => {
        const { resolver, roster } = scopeResolverWith([10, 20], {
            callReport: callReportWith([512]),
        });

        await expect(resolver.resolve(DOMAIN)).resolves.toMatchObject({
            managerIds: [512],
            pilotActive: true,
        });
        expect(roster).not.toHaveBeenCalled();
    });

    it('без фильтра и без списка — ростер ОП по структуре', async () => {
        const { resolver, roster } = scopeResolverWith([20, 10]);

        await expect(resolver.resolve(DOMAIN)).resolves.toEqual({
            managerIds: [10, 20],
            pilotActive: false,
            hiddenByPilot: 0,
            empty: false,
        });
        expect(roster).toHaveBeenCalledWith(DOMAIN);
    });

    it('разбор выключен или статус не прочитан — без ограничения', async () => {
        const disabled = scopeResolverWith([10, 20], {
            callReport: callReportWith([10], false),
        });
        const unknown = scopeResolverWith([10, 20]);

        await expect(
            disabled.resolver.resolve(DOMAIN, [10, 20]),
        ).resolves.toMatchObject({ managerIds: [10, 20], pilotActive: false });
        await expect(
            unknown.resolver.resolve(DOMAIN, [10, 20]),
        ).resolves.toMatchObject({ managerIds: [10, 20], pilotActive: false });
    });

    it('resolveFor берёт статус параметром — настройки второй раз не читаются', async () => {
        const { resolver } = scopeResolverWith([10, 20], {
            callReport: callReportWith([20]),
        });

        // Статус из параметра (пилот 10) главнее настроек резолвера (пилот 20).
        await expect(
            resolver.resolveFor(DOMAIN, [10, 20], callReportWith([10])),
        ).resolves.toMatchObject({ managerIds: [10], hiddenByPilot: 1 });
    });

    it('периметр без фильтра публикуется в кэш для читателей только кэша', async () => {
        const { resolver, setJson } = scopeResolverWith([10, 20], {
            callReport: callReportWith([512, 10]),
        });

        await resolver.resolve(DOMAIN);
        await resolver.resolve(DOMAIN, [10]);

        // Публикуется только периметр без фильтра — зависящий от фильтра нет.
        expect(setJson).toHaveBeenCalledTimes(1);
        expect(setJson).toHaveBeenCalledWith(
            buildManagerScopeKey(DOMAIN),
            [10, 512],
            AI_ANALYTICS_MANAGERS_TTL_SECONDS,
        );
    });

    it('сбой записи в кэш не роняет расчёт периметра', async () => {
        const { resolver, setJson } = scopeResolverWith([10, 20]);
        setJson.mockRejectedValueOnce(new Error('redis down'));

        await expect(resolver.resolve(DOMAIN)).resolves.toMatchObject({
            managerIds: [10, 20],
        });
    });
});
