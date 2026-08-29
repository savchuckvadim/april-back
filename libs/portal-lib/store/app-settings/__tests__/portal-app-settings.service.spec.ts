import {
    EnumPortalAppCode,
    getPortalAppDefaults,
} from '../portal-app-settings.schema';
import { PortalAppSettingsRecord } from '../portal-app-settings.repository';
import { PortalAppSettingsService } from '../portal-app-settings.service';

/**
 * Признак «задано на портале» (storedKeys).
 *
 * Фрейм «Звонки» держит свои дефолты по доменам и без признака не может
 * отличить «портал выключил флаг» от «портал его не трогал»: дефолт
 * реестра false приезжает неотличимо от сохранённого и гасит рабочие фичи
 * боевых порталов (withNoPlan на gsirk, withTM на gsr,
 * withCheckPresentation на alfacentr). Тест сторожит обе половины
 * контракта: значения по-прежнему приезжают ПОЛНЫМ набором, а признак
 * считается по фактическому содержимому JSON портала — и переживает кэш.
 */

const APP = EnumPortalAppCode.eventSales;
const DOMAIN = 'gsr.bitrix24.ru';
const PORTAL_ID = 7;

/** In-memory Redis: только то, что дёргает сервис (get/set/del). */
const makeRedis = () => {
    const store = new Map<string, string>();
    const client = {
        get: (key: string) => Promise.resolve(store.get(key) ?? null),
        set: (key: string, value: string) => {
            store.set(key, value);
            return Promise.resolve('OK');
        },
        del: (key: string) => {
            store.delete(key);
            return Promise.resolve(1);
        },
    };
    return { store, redisService: { getClient: () => client } };
};

/**
 * In-memory репозиторий с семантикой prisma-реализации: upsert сливает
 * JSON (частичное сохранение не теряет остальные ключи), значение null
 * удаляет ключ — «сбросить на дефолт кода».
 */
const makeRepository = (settings: Record<string, unknown> | null) => {
    let row: PortalAppSettingsRecord | null = settings
        ? {
              portalId: PORTAL_ID,
              domain: DOMAIN,
              appCode: APP,
              settings,
              updatedAt: null,
          }
        : null;

    const findByDomain = jest.fn(() => Promise.resolve(row));
    const upsert = jest.fn(
        (
            portalId: number,
            domain: string,
            appCode: EnumPortalAppCode,
            patch: Record<string, unknown>,
        ) => {
            const merged: Record<string, unknown> = {
                ...(row?.settings ?? {}),
                ...patch,
            };
            for (const key of Object.keys(merged)) {
                if (merged[key] === null) delete merged[key];
            }
            row = {
                portalId,
                domain,
                appCode,
                settings: merged,
                updatedAt: null,
            };
            return Promise.resolve(row);
        },
    );

    return { findByDomain, upsert };
};

const makeService = (settings: Record<string, unknown> | null) => {
    const repository = makeRepository(settings);
    const redis = makeRedis();
    const portalRepository = {
        findById: jest.fn(() => Promise.resolve({ domain: DOMAIN })),
    };
    const service = new PortalAppSettingsService(
        repository as never,
        portalRepository as never,
        redis.redisService as never,
    );
    return { service, repository, redis };
};

describe('PortalAppSettingsService: признак «задано на портале»', () => {
    it('сохранённый ключ попадает в storedKeys вместе со своим значением', async () => {
        const { service } = makeService({ with_tm: true, task_group_id: 41 });

        const { values, storedKeys } = await service.resolveWithStored(
            DOMAIN,
            APP,
        );

        expect(storedKeys).toEqual(
            expect.arrayContaining(['withTM', 'taskGroupId']),
        );
        expect(values.withTM).toBe(true);
        expect(values.taskGroupId).toBe(41);
    });

    it('несохранённый ключ в storedKeys не попадает — это дефолт кода', async () => {
        const { service } = makeService({ with_tm: true });

        const { values, storedKeys } = await service.resolveWithStored(
            DOMAIN,
            APP,
        );

        // Ровно случай боевого гашения: withNoPlan приезжает false, но это
        // дефолт реестра, а не решение портала — фрейм его не применит.
        expect(storedKeys).not.toContain('withNoPlan');
        expect(values.withNoPlan).toBe(false);
    });

    it('записи в БД нет — storedKeys пуст, значения дефолтные', async () => {
        const { service } = makeService(null);

        const { values, storedKeys } = await service.resolveWithStored(
            DOMAIN,
            APP,
        );

        expect(storedKeys).toEqual([]);
        expect(values).toEqual(getPortalAppDefaults(APP));
    });

    it('значение чужого типа не считается заданным', async () => {
        // JSON в БД мог написать кто угодно: merge такое значение не
        // применяет, значит и «заданным» ключ называть нельзя — иначе
        // фрейм принял бы дефолт кода за решение владельца.
        const { service } = makeService({ with_tm: 'да', task_group_id: null });

        const { values, storedKeys } = await service.resolveWithStored(
            DOMAIN,
            APP,
        );

        expect(storedKeys).not.toContain('withTM');
        expect(storedKeys).not.toContain('taskGroupId');
        expect(values.withTM).toBe(false);
        expect(values.taskGroupId).toBe(0);
    });

    it('значения по-прежнему отдаются ПОЛНЫМ набором ключей реестра', async () => {
        // Совместимость: бэковые потребители и старые фреймы читают
        // settings.<ключ> и не должны заметить появления признака.
        const { service } = makeService({ with_tm: true });

        const values = await service.resolve(DOMAIN, APP);

        expect(Object.keys(values).sort()).toEqual(
            Object.keys(getPortalAppDefaults(APP)).sort(),
        );
        expect('storedKeys' in values).toBe(false);
    });
});

describe('PortalAppSettingsService: кэш', () => {
    it('кэш хранит и возвращает признак — на втором чтении он не теряется', async () => {
        const { service, repository, redis } = makeService({ with_tm: true });

        const first = await service.resolveWithStored(DOMAIN, APP);
        const second = await service.resolveWithStored(DOMAIN, APP);

        expect(repository.findByDomain).toHaveBeenCalledTimes(1);
        expect(second).toEqual(first);
        expect(second.storedKeys).toEqual(['withTM']);
        // Признак лежит именно в кэшируемом payload, а не собирается
        // заново: иначе он терялся бы на первом же попадании в Redis.
        const cached = [...redis.store.values()][0];
        expect(JSON.parse(cached)).toEqual({
            values: first.values,
            storedKeys: ['withTM'],
        });
    });

    it('запись кэша чужой формы игнорируется — идём в БД', async () => {
        // Значение прошлой версии (плоские значения без признака) лежит под
        // старым ключом и не читается, но перестраховка на месте: ответа
        // без storedKeys фрейм получить не должен.
        const { service, redis, repository } = makeService({ with_tm: true });
        await service.resolveWithStored(DOMAIN, APP);
        const key = [...redis.store.keys()][0];
        redis.store.set(key, JSON.stringify({ withTM: false }));

        const resolved = await service.resolveWithStored(DOMAIN, APP);

        expect(repository.findByDomain).toHaveBeenCalledTimes(2);
        expect(resolved.storedKeys).toEqual(['withTM']);
        expect(resolved.values.withTM).toBe(true);
    });

    it('версия формы стоит в ключе кэша', async () => {
        const { service, redis } = makeService(null);

        await service.resolveWithStored(DOMAIN, APP);

        expect([...redis.store.keys()]).toEqual([
            `portal-app-settings:v2:${DOMAIN}:${APP}`,
        ]);
    });
});

describe('PortalAppSettingsService.save: что становится «заданным»', () => {
    it('сохранение значения, РАВНОГО дефолту, делает ключ заданным', async () => {
        // Владелец выбрал значение явно — фрейм обязан применить его
        // поверх своего доменного, даже если оно совпало с дефолтом кода.
        const { service } = makeService(null);

        await service.save(PORTAL_ID, APP, { withNoPlan: false });
        const { values, storedKeys } = await service.resolveWithStored(
            DOMAIN,
            APP,
        );

        expect(storedKeys).toEqual(['withNoPlan']);
        expect(values.withNoPlan).toBe(false);
    });

    it('явный null снимает решение портала — ключ уходит из storedKeys', async () => {
        const { service } = makeService({ with_no_plan: true });

        await service.save(PORTAL_ID, APP, { withNoPlan: null });
        const { values, storedKeys } = await service.resolveWithStored(
            DOMAIN,
            APP,
        );

        expect(storedKeys).toEqual([]);
        expect(values.withNoPlan).toBe(false);
    });

    it('сохранение сбрасывает кэш — признак не залипает на 5 минут', async () => {
        const { service, redis } = makeService(null);
        await service.resolveWithStored(DOMAIN, APP);
        expect(redis.store.size).toBe(1);

        await service.save(PORTAL_ID, APP, { withTM: true });

        expect(redis.store.size).toBe(0);
        const resolved = await service.resolveWithStored(DOMAIN, APP);
        expect(resolved.storedKeys).toEqual(['withTM']);
    });
});
