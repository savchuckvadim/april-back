import { envOnlyReader } from '../vendor-settings.contract';
import {
    VENDOR_SECRET_KEYS,
    VENDOR_SETTINGS,
    VENDOR_SETTING_GROUP_INFO,
    VENDOR_SETTING_KEYS,
    isVendorSettingKey,
    vendorSettingOf,
} from '../vendor-settings.registry';

describe('реестр настроек вендора', () => {
    it('каждый ключ описан ровно один раз, с группой из справочника и текстами для админки', () => {
        expect(VENDOR_SETTINGS.map(item => item.key).sort()).toEqual(
            [...VENDOR_SETTING_KEYS].sort(),
        );
        for (const item of VENDOR_SETTINGS) {
            expect(VENDOR_SETTING_GROUP_INFO[item.group]).toBeDefined();
            expect(item.label.length).toBeGreaterThan(3);
            expect(item.description.length).toBeGreaterThan(20);
            expect(item.howTo.length).toBeGreaterThan(20);
            expect(item.example.length).toBeGreaterThan(0);
        }
        expect(isVendorSettingKey('GROQ_API_KEY')).toBe(true);
        expect(isVendorSettingKey('DATABASE_URL')).toBe(false);
        expect(() => vendorSettingOf('NOPE' as never)).toThrow('Нет описания');
    });

    it('ключи и токен — секреты, адрес и хосты прокси — нет', () => {
        expect([...VENDOR_SECRET_KEYS].sort()).toEqual([
            'ANTHROPIC_API_KEY',
            'CLOUDRU_API_KEY',
            'EGRESS_PROXY_TOKEN',
            'GROQ_API_KEY',
        ]);
    });

    it('проверки: адрес прокси — полный https, хосты — имена через запятую', () => {
        const url = vendorSettingOf('EGRESS_PROXY_URL').validate!;
        expect(url('https://eu-proxy.april-app.ru/p')).toBeNull();
        expect(url('eu-proxy.april-app.ru/p')).toContain('https://');
        expect(url('ftp://x.y/p')).toContain('https://');

        const hosts = vendorSettingOf('EGRESS_PROXY_HOSTS').validate!;
        expect(hosts('api.groq.com, .googleapis.com')).toBeNull();
        expect(hosts('https://api.groq.com')).toContain(
            'не похоже на имя хоста',
        );
        expect(hosts(' , ')).toContain('хотя бы один хост');
    });
});

describe('envOnlyReader', () => {
    it('читает env, пустое и пробелы — null, getMany собирает набор', async () => {
        const reader = envOnlyReader(
            key => ({ A: ' a ', B: '   ' })[key as 'A' | 'B'],
        );
        expect(await reader.get('A')).toBe('a');
        expect(await reader.get('B')).toBeNull();
        expect(await reader.getMany(['A', 'B', 'C'])).toEqual({
            A: 'a',
            B: null,
            C: null,
        });
    });
});
