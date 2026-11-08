import { envOnlyReader } from '../vendor-settings.contract';
import { TELEGRAM_BOT_TOKEN_SETTING_KEYS } from '../vendor-settings.telegram';
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
            'CABINET_TELEGRAM_BOT_TOKEN',
            'CLOUDRU_API_KEY',
            'EGRESS_PROXY_TOKEN',
            'GROQ_API_KEY',
            'SUPPORT_TELEGRAM_BOT_TOKEN',
        ]);
    });

    it('Telegram-боты: все токены — секреты одной группы, чат поддержки — число', () => {
        for (const key of TELEGRAM_BOT_TOKEN_SETTING_KEYS) {
            const item = vendorSettingOf(key);
            expect(item.secret).toBe(true);
            expect(item.group).toBe('telegram-bots');
            expect(item.howTo).toContain('Если токен утёк');
        }
        const chat = vendorSettingOf('SUPPORT_TELEGRAM_CHAT_ID').validate!;
        expect(chat('-1001234567890')).toBeNull();
        expect(chat('123456789')).toBeNull();
        expect(chat('@support_chat')).toContain('число');
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
