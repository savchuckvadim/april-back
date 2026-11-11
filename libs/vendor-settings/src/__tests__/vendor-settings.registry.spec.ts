import { envOnlyReader } from '../vendor-settings.contract';
import {
    LLM_FALLBACK_SETTING_KEYS,
    LLM_GATEWAY_SETTING_KEYS,
    LLM_INTEGER_SETTING_RULES,
    type LlmIntegerSettingKey,
} from '../vendor-settings.llm';
import { TELEGRAM_BOT_TOKEN_SETTING_KEYS } from '../vendor-settings.telegram';
import {
    VENDOR_SECRET_KEYS,
    VENDOR_SETTINGS,
    VENDOR_SETTING_GROUPS,
    VENDOR_SETTING_GROUP_INFO,
    VENDOR_SETTING_KEYS,
    isVendorSettingKey,
    vendorSettingOf,
} from '../vendor-settings.registry';
import { integerSettingValue } from '../vendor-settings.validators';

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
            'LLM_FALLBACK_API_KEY',
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

/** Настройки шлюза модели переехали из env в админку (11.11.2026). */
describe('реестр: шлюз модели разборов', () => {
    it('своя группа сразу после ключей AI; свой запасной поставщик — среди ключей AI', () => {
        expect(VENDOR_SETTING_GROUPS.indexOf('llm-gateway')).toBe(
            VENDOR_SETTING_GROUPS.indexOf('ai-keys') + 1,
        );
        for (const key of LLM_GATEWAY_SETTING_KEYS) {
            expect(vendorSettingOf(key).group).toBe('llm-gateway');
        }
        for (const key of LLM_FALLBACK_SETTING_KEYS) {
            expect(vendorSettingOf(key).group).toBe('ai-keys');
        }
        // Внутри группы ключей AI свой поставщик идёт после Groq и Cloud.ru.
        const aiKeys = VENDOR_SETTINGS.filter(
            item => item.group === 'ai-keys',
        ).map(item => item.key);
        expect(aiKeys.slice(0, 2)).toEqual(['GROQ_API_KEY', 'CLOUDRU_API_KEY']);
    });

    it('у каждого числа: значение по умолчанию в диапазоне и оно же — пример в поле', () => {
        for (const [key, rule] of Object.entries(LLM_INTEGER_SETTING_RULES)) {
            expect(rule.defaultValue).toBeGreaterThanOrEqual(rule.min);
            expect(rule.defaultValue).toBeLessThanOrEqual(rule.max);
            expect(vendorSettingOf(key as LlmIntegerSettingKey).example).toBe(
                String(rule.defaultValue),
            );
        }
    });

    it('проверка чисел в админке: целое в диапазоне, понятная ошибка по-русски', () => {
        const timeout = vendorSettingOf(
            'VIBECODE_ANALYSIS_TIMEOUT_MS',
        ).validate!;
        expect(timeout('300000')).toBeNull();
        expect(timeout('180 000')).toBeNull();
        expect(timeout('600000')).toBe(
            'Нужно целое число от 30 000 до 300 000',
        );
        expect(timeout('три минуты')).toContain('Нужно целое число');

        const perKey = vendorSettingOf(
            'LLM_VIBECODE_KEY_CONCURRENCY',
        ).validate!;
        expect(perKey('6')).toBeNull();
        expect(perKey('0')).toBe('Нужно целое число от 1 до 50');
        expect(perKey('2.5')).toContain('Нужно целое число');
    });

    it('режим JSON — только json_schema или json_object; адрес — полный https', () => {
        const mode = vendorSettingOf('LLM_FALLBACK_JSON_MODE').validate!;
        expect(mode('json_object')).toBeNull();
        expect(mode('json')).toBe('Допустимо: json_schema или json_object');

        const url = vendorSettingOf('LLM_FALLBACK_BASE_URL').validate!;
        expect(url('https://foundation-models.api.cloud.ru/v1')).toBeNull();
        expect(url('foundation-models.api.cloud.ru')).toContain('https://');
    });

    it('integerSettingValue: мусор — по умолчанию, вне диапазона — граница', () => {
        const rule = { min: 1, max: 10, defaultValue: 4 };
        expect(integerSettingValue(null, rule)).toBe(4);
        expect(integerSettingValue('abc', rule)).toBe(4);
        expect(integerSettingValue(' 7 ', rule)).toBe(7);
        expect(integerSettingValue('0', rule)).toBe(1);
        expect(integerSettingValue('99', rule)).toBe(10);
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
