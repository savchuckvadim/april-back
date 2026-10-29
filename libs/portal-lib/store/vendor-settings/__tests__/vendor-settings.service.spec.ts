import { BadRequestException, Logger } from '@nestjs/common';
import { VENDOR_SECRET_MASK } from '@lib/vendor-settings';
import {
    VendorSettingRow,
    VendorSettingsRepository,
    VendorSettingUpsert,
} from '../vendor-settings.repository';
import {
    VENDOR_SETTINGS_CACHE_TTL_MS,
    VendorSettingsService,
} from '../vendor-settings.service';

/** Память вместо Prisma; `failing` — таблицы нет (миграция не применена). */
class MemoryRepository extends VendorSettingsRepository {
    rows = new Map<string, VendorSettingRow>();
    reads = 0;
    failing = false;

    findAll(): Promise<VendorSettingRow[]> {
        this.reads += 1;
        if (this.failing) {
            return Promise.reject(
                new Error("Table 'vendor_settings' doesn't exist"),
            );
        }
        return Promise.resolve([...this.rows.values()]);
    }

    upsert(row: VendorSettingUpsert): Promise<void> {
        this.rows.set(row.key, {
            key: row.key,
            value: row.value,
            isSecret: row.isSecret,
            updatedAt: new Date('2026-10-29T15:00:00Z'),
            updatedBy: row.updatedBy,
        });
        return Promise.resolve();
    }

    remove(key: string): Promise<void> {
        this.rows.delete(key);
        return Promise.resolve();
    }
}

/** «Шифрование» наоборот — достаточно, чтобы отличить хранимое от открытого. */
const crypto = {
    encrypt: (plain: string) => `enc(${plain})`,
    decrypt: (payload: string) => {
        const match = /^enc\((.*)\)$/.exec(payload);
        if (!match) throw new Error('bad payload');
        return match[1];
    },
};

const setup = (env: Record<string, string> = {}) => {
    const repository = new MemoryRepository();
    const config = { get: (key: string) => env[key] };
    const service = new VendorSettingsService(
        repository,
        crypto as never,
        config as never,
    );
    return { service, repository };
};

describe('VendorSettingsService', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });
    afterEach(() => jest.restoreAllMocks());

    it('значение из админки важнее env; нет ни того, ни другого — null; чужие ключи — только env', async () => {
        const { service } = setup({
            GROQ_API_KEY: 'env-groq',
            EGRESS_PROXY_HOSTS: 'api.openai.com',
            DATABASE_URL: 'mysql://x',
        });
        await service.save('GROQ_API_KEY', 'admin-groq', 'vadim');

        expect(await service.get('GROQ_API_KEY')).toBe('admin-groq');
        expect(await service.get('EGRESS_PROXY_HOSTS')).toBe('api.openai.com');
        expect(await service.get('EGRESS_PROXY_URL')).toBeNull();
        expect(await service.getMany(['DATABASE_URL', 'NOPE'])).toEqual({
            DATABASE_URL: 'mysql://x',
            NOPE: null,
        });
    });

    it('секрет хранится зашифрованным, наружу не отдаётся; маска при сохранении оставляет прежнее', async () => {
        const { service, repository } = setup();
        const saved = await service.save('CLOUDRU_API_KEY', ' ck-1 ', 'vadim');

        expect(repository.rows.get('CLOUDRU_API_KEY')?.value).toBe('enc(ck-1)');
        expect(saved).toMatchObject({
            key: 'CLOUDRU_API_KEY',
            secret: true,
            value: null,
            isSet: true,
            envSet: false,
            source: 'admin',
            updatedBy: 'vadim',
        });
        expect(await service.get('CLOUDRU_API_KEY')).toBe('ck-1');

        await service.save('CLOUDRU_API_KEY', VENDOR_SECRET_MASK, 'other');
        expect(repository.rows.get('CLOUDRU_API_KEY')?.updatedBy).toBe('vadim');
        expect(await service.get('CLOUDRU_API_KEY')).toBe('ck-1');
    });

    it('пустое значение снимает настройку — снова действует env; несекрет виден открыто', async () => {
        const { service } = setup({ EGRESS_PROXY_URL: 'https://env/p' });
        await service.save('EGRESS_PROXY_URL', 'https://admin/p', null);
        expect(await service.get('EGRESS_PROXY_URL')).toBe('https://admin/p');

        const view = await service.save('EGRESS_PROXY_URL', '', null);
        expect(view).toMatchObject({
            value: null,
            isSet: false,
            envSet: true,
            source: 'env',
        });
        expect(await service.get('EGRESS_PROXY_URL')).toBe('https://env/p');
    });

    it('проверка реестра: кривой адрес и мусор в хостах — 400 с понятным текстом, в базу не пишется', async () => {
        const { service, repository } = setup();
        await expect(
            service.save('EGRESS_PROXY_URL', 'eu-proxy.april-app.ru', null),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            service.save('EGRESS_PROXY_HOSTS', 'https://api.groq.com', null),
        ).rejects.toThrow('не похоже на имя хоста');
        expect(repository.rows.size).toBe(0);
    });

    it('list: все настройки реестра по порядку с источником; битый шифртекст — как не задано', async () => {
        const { service, repository } = setup({ GROQ_API_KEY: 'env-groq' });
        repository.rows.set('ANTHROPIC_API_KEY', {
            key: 'ANTHROPIC_API_KEY',
            value: 'garbage',
            isSecret: true,
            updatedAt: null,
            updatedBy: null,
        });
        const list = await service.list();

        expect(list.map(item => item.key)).toEqual([
            'EGRESS_PROXY_URL',
            'EGRESS_PROXY_TOKEN',
            'EGRESS_PROXY_HOSTS',
            'GROQ_API_KEY',
            'CLOUDRU_API_KEY',
            'ANTHROPIC_API_KEY',
        ]);
        expect(list.find(item => item.key === 'GROQ_API_KEY')).toMatchObject({
            source: 'env',
            envSet: true,
            isSet: false,
        });
        expect(
            list.find(item => item.key === 'ANTHROPIC_API_KEY'),
        ).toMatchObject({ source: 'none', isSet: false });
        expect(list[0].howTo).toContain('Dokploy');
    });

    it('кэш минуту: повторные чтения базу не трогают, запись сбрасывает кэш', async () => {
        const { service, repository } = setup();
        await service.get('GROQ_API_KEY');
        await service.getMany(['GROQ_API_KEY', 'CLOUDRU_API_KEY']);
        expect(repository.reads).toBe(1);

        await service.save('GROQ_API_KEY', 'g', null);
        expect(repository.reads).toBe(2);

        jest.spyOn(Date, 'now').mockReturnValue(
            Date.now() + VENDOR_SETTINGS_CACHE_TTL_MS + 1,
        );
        await service.get('GROQ_API_KEY');
        expect(repository.reads).toBe(3);
    });

    it('таблицы ещё нет — работаем по env, предупреждение одно, базу не долбим', async () => {
        const { service, repository } = setup({ GROQ_API_KEY: 'env-groq' });
        repository.failing = true;
        const warn = jest.spyOn(Logger.prototype, 'warn');

        expect(await service.get('GROQ_API_KEY')).toBe('env-groq');
        expect(await service.get('CLOUDRU_API_KEY')).toBeNull();
        expect((await service.list())[3]).toMatchObject({
            key: 'GROQ_API_KEY',
            source: 'env',
        });
        expect(repository.reads).toBe(1);
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
