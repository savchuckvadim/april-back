/**
 * Реестр настроек вендора: что можно задать в админке, как это называется
 * по-русски, где взять значение и как его проверить. Ключ настройки равен
 * имени переменной окружения, которую она перекрывает, — так одна и та же
 * логика чтения работает и для env, и для админки.
 */

import {
    TELEGRAM_BOT_SETTING_KEYS,
    TELEGRAM_BOT_SETTINGS,
} from './vendor-settings.telegram';

export const VENDOR_SETTING_GROUPS = [
    'egress-proxy',
    'ai-keys',
    'support',
    'telegram-bots',
    'widgets',
] as const;
export type VendorSettingGroup = (typeof VENDOR_SETTING_GROUPS)[number];

/**
 * Адреса фронтов виджетов приложения «April» — `MARKETPLACE_WIDGET_URL_<КОД>`
 * (код виджета в верхнем регистре, дефисы → «_»). Те же имена, что у прежней
 * env-подмены роутера apps/pbx, — env продолжает работать как запасной путь.
 * Каждый код из реестра виджетов (portal-lib `APP_WIDGETS`) обязан иметь
 * ключ — это проверяет тест роутера.
 */
export const WIDGET_URL_SETTING_KEYS = [
    'MARKETPLACE_WIDGET_URL_EVENT_SALES',
    'MARKETPLACE_WIDGET_URL_KONSTRUCTOR',
    'MARKETPLACE_WIDGET_URL_REPORT_SALES',
    'MARKETPLACE_WIDGET_URL_EVENT_SERVICE',
    'MARKETPLACE_WIDGET_URL_KONSTRUCTOR_SERVICE',
    'MARKETPLACE_WIDGET_URL_REPORT_SERVICE',
] as const;

/** Ключ настройки адреса фронта виджета по его коду (`event-sales` → …_EVENT_SALES). */
export function widgetUrlSettingKey(widgetCode: string): string {
    return `MARKETPLACE_WIDGET_URL_${widgetCode.toUpperCase().replace(/-/g, '_')}`;
}

export const VENDOR_SETTING_KEYS = [
    'EGRESS_PROXY_URL',
    'EGRESS_PROXY_TOKEN',
    'EGRESS_PROXY_HOSTS',
    'GROQ_API_KEY',
    'CLOUDRU_API_KEY',
    'ANTHROPIC_API_KEY',
    ...TELEGRAM_BOT_SETTING_KEYS,
    ...WIDGET_URL_SETTING_KEYS,
] as const;
export type VendorSettingKey = (typeof VENDOR_SETTING_KEYS)[number];

export interface VendorSettingGroupInfo {
    title: string;
    description: string;
}

export interface VendorSettingDefinition {
    key: VendorSettingKey;
    group: VendorSettingGroup;
    /** Название поля в админке. */
    label: string;
    /** Что делает настройка и на что влияет. */
    description: string;
    /** Где взять значение и как заполнить — шаги для администратора. */
    howTo: string;
    /** Секрет: хранится зашифрованным, наружу отдаётся маска. */
    secret: boolean;
    /** Пример значения для подсказки в поле. */
    example: string;
    /** Проверка значения перед сохранением: текст ошибки по-русски или null. */
    validate?: (value: string) => string | null;
}

export const VENDOR_SETTING_GROUP_INFO: Readonly<
    Record<VendorSettingGroup, VendorSettingGroupInfo>
> = {
    'egress-proxy': {
        title: 'Исходящий прокси за рубеж',
        description:
            'Сервисы за пределами России (Groq, OpenAI, Anthropic, Telegram) с наших серверов напрямую не отвечают. Вызовы к хостам из списка уходят через наш прокси на европейском сервере. Российские сервисы (Битрикс, Яндекс, VibeCode, Cloud.ru) идут напрямую.',
    },
    'ai-keys': {
        title: 'Ключи AI-сервисов приложения',
        description:
            'Запасные поставщики разборов и транскрибации на случай отказа или подорожания VibeCode. Ключ портала в карточке портала важнее этих ключей. Какой поставщик действует сейчас, показывает чек-лист «Поставщики AI» в настройках AI портала.',
    },
    support: {
        title: 'Модуль технической поддержки',
        description:
            'Ключи сервисов, которыми пользуется бот поддержки и монитор обращений.',
    },
    'telegram-bots': {
        title: 'Telegram-боты',
        description:
            'У April три бота, у каждого своя задача — не путайте токены. Поддержка — для сотрудников April (сигналы линии, ИИ-помощник). Клиентский — для клиентов (отчёты и уведомления; чат привязывается кодом из кабинета). Бот тревог разработчика задаётся только в окружении сервера (TELEGRAM_BOT_TOKEN): он должен работать, даже когда недоступна база с этими настройками. Сверху показано, какой бот сейчас стоит в каждом поле.',
    },
    widgets: {
        title: 'Виджеты приложения April: адреса фронтов',
        description:
            'Куда открывается каждый виджет (вкладка в карточке, пункт меню). В Битриксе привязан постоянный адрес нашего сервера, а он уже перенаправляет на фронт отсюда — смена адреса действует на всех порталах в течение минуты, переустанавливать виджеты не нужно. Пусто — адрес по умолчанию.',
    },
};

const HOST_RE = /^\.?[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

/** Пусто — нормально (настройка снимается); непустое значение проверяем. */
const validateUrl = (value: string): string | null => {
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        return 'Адрес должен начинаться с https:// и быть полным, например https://eu-proxy.april-app.ru/p';
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return 'Адрес должен начинаться с https://';
    }
    return null;
};

const validateHosts = (value: string): string | null => {
    const hosts = value
        .split(',')
        .map(host => host.trim())
        .filter(Boolean);
    if (!hosts.length) {
        return 'Укажите хотя бы один хост, например api.groq.com';
    }
    const bad = hosts.find(host => !HOST_RE.test(host));
    return bad
        ? `«${bad}» не похоже на имя хоста: нужно вроде api.groq.com или .googleapis.com, без https:// и путей`
        : null;
};

export const VENDOR_SETTINGS: readonly VendorSettingDefinition[] = [
    {
        key: 'EGRESS_PROXY_URL',
        group: 'egress-proxy',
        label: 'Адрес прокси',
        description:
            'Адрес нашего прокси с префиксом пути. Пока не задан ни здесь, ни в окружении, все вызовы идут напрямую.',
        howTo: 'Прокси развёрнут в Dokploy на европейском сервере: панель panel.divan.group → проект «april» → сервис «ai-egress-proxy» → вкладка Domains. Возьмите домен оттуда и добавьте «/p» в конце: https://eu-proxy.april-app.ru/p. Домен должен указывать на сервер A-записью в DNS.',
        secret: false,
        example: 'https://eu-proxy.april-app.ru/p',
        validate: validateUrl,
    },
    {
        key: 'EGRESS_PROXY_TOKEN',
        group: 'egress-proxy',
        label: 'Токен прокси',
        description:
            'Прокси пропускает только запросы с этим токеном в заголовке X-Egress-Token. Хранится зашифрованным.',
        howTo: 'Dokploy → проект «april» → сервис «ai-egress-proxy» → вкладка Environment, переменная EGRESS_TOKEN. Если меняете токен, меняйте его в обоих местах и нажмите Redeploy у сервиса.',
        secret: true,
        example: 'строка из 64 знаков',
    },
    {
        key: 'EGRESS_PROXY_HOSTS',
        group: 'egress-proxy',
        label: 'Хосты через прокси',
        description:
            'Какие адреса ходят через прокси, через запятую. Запись вида .googleapis.com включает все поддомены. Остальные хосты идут напрямую.',
        howTo: 'Например: api.groq.com, api.openai.com, api.anthropic.com, api.telegram.org. Каждый хост должен быть разрешён и на самом прокси: Dokploy → сервис «ai-egress-proxy» → вкладка Mounts → файл allowed-hosts.conf, строка «хост 1;», затем Redeploy. Российские сервисы (Битрикс, Яндекс, VibeCode, Cloud.ru) сюда не добавлять.',
        secret: false,
        example: 'api.groq.com, api.telegram.org',
        validate: validateHosts,
    },
    {
        key: 'GROQ_API_KEY',
        group: 'ai-keys',
        label: 'Ключ Groq',
        description:
            'Один ключ закрывает два резерва: запасной LLM разборов (после Cloud.ru, если он задан) и резервную транскрибацию Whisper, когда нет своего Whisper-сервиса. Сервис за рубежом, нужен прокси.',
        howTo: 'console.groq.com → API Keys → Create API Key, скопировать ключ сюда. Добавьте api.groq.com в хосты прокси. Лимит файла на бесплатном тарифе 25 МБ (около 25 минут записи).',
        secret: true,
        example: 'gsk_…',
    },
    {
        key: 'CLOUDRU_API_KEY',
        group: 'ai-keys',
        label: 'Ключ Cloud.ru',
        description:
            'Российское облако Сбера, открытые модели (Qwen3) по OpenAI-совместимому API. При заданном ключе становится запасным LLM разборов впереди Groq; прокси не нужен, данные остаются в России. Также модель «cloudru» для резюме и рекомендаций.',
        howTo: 'console.cloud.ru → Evolution Foundation Models (AI Factory) → API-ключи → создать ключ. Использовать только открытые модели, размещённые в России (Qwen, bge-m3); «внешние» модели каталога (Claude, GPT, Gemini) уводят данные за рубеж.',
        secret: true,
        example: 'ключ из консоли Cloud.ru',
    },
    {
        key: 'ANTHROPIC_API_KEY',
        group: 'support',
        label: 'Ключ Claude API (Anthropic)',
        description:
            'Ключ для ответов Claude в модуле технической поддержки. Пока ключ только хранится: подключение модуля поддержки к Claude — следующий шаг. Сервис за рубежом, нужен прокси.',
        howTo: 'console.anthropic.com → API Keys → Create Key, скопировать ключ сюда. Добавьте api.anthropic.com в хосты прокси.',
        secret: true,
        example: 'sk-ant-…',
    },
    ...TELEGRAM_BOT_SETTINGS,
    widgetUrl(
        'MARKETPLACE_WIDGET_URL_EVENT_SALES',
        'Звонки (отдел продаж)',
        'https://event-sales.april-app.ru/',
    ),
    widgetUrl(
        'MARKETPLACE_WIDGET_URL_KONSTRUCTOR',
        'Конструктор КП',
        'https://konstructor.april-app.ru/',
    ),
    widgetUrl(
        'MARKETPLACE_WIDGET_URL_REPORT_SALES',
        'Отчёт ОП KPI',
        'https://kpi-sales.april-app.ru/',
    ),
    widgetUrl(
        'MARKETPLACE_WIDGET_URL_EVENT_SERVICE',
        'Звонки (сервис)',
        'https://event-service.april-app.ru/',
    ),
    widgetUrl(
        'MARKETPLACE_WIDGET_URL_KONSTRUCTOR_SERVICE',
        'Конструктор КП (сервис)',
        'https://konstructor.april-app.ru/',
    ),
    widgetUrl(
        'MARKETPLACE_WIDGET_URL_REPORT_SERVICE',
        'Отчёт КЦ KPI',
        'https://kpi-service.april-app.ru/',
    ),
];

/**
 * Описание адреса фронта виджета. Значение по умолчанию живёт в манифесте
 * роутера apps/pbx (`MARKETPLACE_WIDGETS[].frontUrl`) — здесь только пример.
 */
function widgetUrl(
    key: (typeof WIDGET_URL_SETTING_KEYS)[number],
    title: string,
    defaultUrl: string,
): VendorSettingDefinition {
    return {
        key,
        group: 'widgets',
        label: `Виджет «${title}»: адрес фронта`,
        description: `Куда роутер April перенаправляет открытие виджета «${title}» на всех порталах. Пусто — адрес по умолчанию ${defaultUrl}. Действует в течение минуты, переустанавливать виджеты не нужно.`,
        howTo: 'Полный адрес страницы виджета, которая работает внутри Битрикс24 (в iframe). Перед заменой проверьте новый фронт на тестовом портале.',
        secret: false,
        example: defaultUrl,
        validate: validateUrl,
    };
}

export const isVendorSettingKey = (value: string): value is VendorSettingKey =>
    (VENDOR_SETTING_KEYS as readonly string[]).includes(value);

/** Описание настройки по ключу; неизвестный ключ — ошибка программиста. */
export function vendorSettingOf(
    key: VendorSettingKey,
): VendorSettingDefinition {
    const definition = VENDOR_SETTINGS.find(item => item.key === key);
    if (!definition) throw new Error(`Нет описания настройки ${key}`);
    return definition;
}

/** Ключи, которые хранятся зашифрованными. */
export const VENDOR_SECRET_KEYS: readonly VendorSettingKey[] =
    VENDOR_SETTINGS.filter(item => item.secret).map(item => item.key);
