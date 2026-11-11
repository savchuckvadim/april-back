import type { VendorSettingDefinition } from './vendor-settings.registry';
import {
    type IntegerSettingRule,
    integerInRange,
    oneOf,
    validateUrl,
} from './vendor-settings.validators';

/**
 * Настройки шлюза модели разборов звонков в админке (11.11.2026, решение
 * владельца — «не в env, а в админке»):
 * - группа «llm-gateway» — сколько ждать ответ VibeCode, сколько запросов
 *   разом, предохранитель поставщиков;
 * - в группу «ai-keys», к ключам Groq и Cloud.ru, — свой запасной поставщик
 *   (любой OpenAI-совместимый).
 *
 * Читают их @lib/llm-gateway (LlmGatewaySettingsService) и @lib/vibecode
 * (таймаут разбора) через общий читатель: значение из админки действует в
 * течение минуты без перезапуска, env с тем же именем — запасной путь.
 */

/** Целочисленные настройки шлюза: диапазон для админки и значение по умолчанию. */
export const LLM_INTEGER_SETTING_RULES = {
    // Выше 300 000 бесполезно: fetch Node (undici) сам рвёт ожидание
    // заголовков ответа на пяти минутах.
    VIBECODE_ANALYSIS_TIMEOUT_MS: {
        min: 30_000,
        max: 300_000,
        defaultValue: 180_000,
    },
    LLM_VIBECODE_KEY_CONCURRENCY: { min: 1, max: 50, defaultValue: 6 },
    LLM_VIBECODE_CONCURRENCY: { min: 1, max: 200, defaultValue: 12 },
    LLM_CIRCUIT_FAILURES: { min: 1, max: 100, defaultValue: 5 },
    LLM_CIRCUIT_WINDOW_SEC: { min: 30, max: 86_400, defaultValue: 600 },
    LLM_CIRCUIT_COOLDOWN_SEC: { min: 30, max: 86_400, defaultValue: 300 },
    LLM_FALLBACK_TIMEOUT_MS: {
        min: 10_000,
        max: 300_000,
        defaultValue: 180_000,
    },
} as const satisfies Record<string, IntegerSettingRule>;
export type LlmIntegerSettingKey = keyof typeof LLM_INTEGER_SETTING_RULES;

/**
 * Как просить JSON у запасного поставщика: `json_schema` — строгая схема в
 * response_format; `json_object` — только «верни JSON», схема дописывается
 * в системный промпт (модели без structured output).
 */
export const LLM_FALLBACK_JSON_MODES = ['json_schema', 'json_object'] as const;
export type LlmFallbackJsonMode = (typeof LLM_FALLBACK_JSON_MODES)[number];
export const LLM_FALLBACK_JSON_MODE_DEFAULT: LlmFallbackJsonMode =
    'json_schema';

/** Группа «Разборы звонков: очередь к модели, ожидание и предохранитель». */
export const LLM_GATEWAY_SETTING_KEYS = [
    'VIBECODE_ANALYSIS_TIMEOUT_MS',
    'LLM_VIBECODE_KEY_CONCURRENCY',
    'LLM_VIBECODE_CONCURRENCY',
    'LLM_CIRCUIT_FAILURES',
    'LLM_CIRCUIT_WINDOW_SEC',
    'LLM_CIRCUIT_COOLDOWN_SEC',
] as const;

/** Свой запасной поставщик разборов — в группе ключей AI-сервисов. */
export const LLM_FALLBACK_SETTING_KEYS = [
    'LLM_FALLBACK_BASE_URL',
    'LLM_FALLBACK_API_KEY',
    'LLM_FALLBACK_MODEL',
    'LLM_FALLBACK_JSON_MODE',
    'LLM_FALLBACK_TIMEOUT_MS',
] as const;

const LIVE = 'Действует в течение минуты, перезапуск не нужен.';

/** Описание целочисленной настройки: проверка и пример — из правила. */
function integerSetting(
    key: LlmIntegerSettingKey,
    group: VendorSettingDefinition['group'],
    texts: Pick<VendorSettingDefinition, 'label' | 'description' | 'howTo'>,
): VendorSettingDefinition {
    const rule = LLM_INTEGER_SETTING_RULES[key];
    return {
        key,
        group,
        ...texts,
        secret: false,
        example: String(rule.defaultValue),
        validate: integerInRange(rule),
    };
}

export const LLM_GATEWAY_SETTINGS: readonly VendorSettingDefinition[] = [
    integerSetting('VIBECODE_ANALYSIS_TIMEOUT_MS', 'llm-gateway', {
        label: 'VibeCode: сколько ждать ответ на разбор, мс',
        description:
            'Сколько ждать ответ модели VibeCode на один проход разбора звонка (форма, содержание, движение сделки, итог), в миллисекундах. Отсчёт идёт с отправки запроса, ожидание своей очереди сюда не входит. Не дождались — проход считается сорвавшимся, и его дозаполнит ежечасный догон разборов. По умолчанию 180 000 (3 минуты). Больше 300 000 (5 минут) поставить нельзя: на пяти минутах соединение обрывает сама платформа сервера.',
        howTo: `В журнале разборов это строки «не ответил … через 180000 мс». Если они идут часто, а повтор потом проходит — поднимите до 300 000 и посмотрите журнал за день. ${LIVE}`,
    }),
    integerSetting('LLM_VIBECODE_KEY_CONCURRENCY', 'llm-gateway', {
        label: 'VibeCode: запросов разом на один портал',
        description:
            'Сколько запросов к VibeCode одновременно уходит с ключа одного портала, остальные ждут своей очереди. Разбор звонка — это 3–4 прохода и итог, а приложение разбирает до 9 звонков разом: без этого предела с одного ключа уходило до 36 запросов, и затор у модели создавали мы сами. По умолчанию 6.',
        howTo: `В журнале разборов у каждого вызова есть «ждал слота N мс». Если запросы подолгу ждут очереди, а таймаутов нет, предел можно поднять. Если таймаутов много — опустить. ${LIVE}`,
    }),
    integerSetting('LLM_VIBECODE_CONCURRENCY', 'llm-gateway', {
        label: 'VibeCode: запросов разом на всё приложение',
        description:
            'Общий предел одновременных запросов к VibeCode со всех порталов в одном приложении. Нужен, чтобы сервер не заваливал модель, когда разборы идут сразу у нескольких клиентов. По умолчанию 12.',
        howTo: `Обычно вдвое больше предела на портал. ${LIVE}`,
    }),
    integerSetting('LLM_CIRCUIT_FAILURES', 'llm-gateway', {
        label: 'Предохранитель: сбоев до паузы',
        description:
            'Сколько временных сбоев поставщика модели за окно ставят его на паузу. Временный сбой — это нет ответа в срок, ошибка сервера, «слишком много запросов» или обрыв сети. На паузе разборы сразу идут к запасному поставщику, а не ждут срок ответа на каждом звонке. О начале и конце паузы приходит сообщение в телеграм. По умолчанию 5.',
        howTo: `Меньше — пауза наступает раньше и чаще. Больше — дольше терпим сбои основного поставщика. ${LIVE}`,
    }),
    integerSetting('LLM_CIRCUIT_WINDOW_SEC', 'llm-gateway', {
        label: 'Предохранитель: окно счёта сбоев, секунд',
        description:
            'За какой промежуток считаются сбои для паузы. По умолчанию 600 (10 минут): пять сбоев за десять минут ставят поставщика на паузу.',
        howTo: `Окно короче — пауза только при плотной серии сбоев. ${LIVE}`,
    }),
    integerSetting('LLM_CIRCUIT_COOLDOWN_SEC', 'llm-gateway', {
        label: 'Предохранитель: длина паузы, секунд',
        description:
            'Сколько поставщик стоит на паузе. Пока она идёт, к нему уходит только один пробный запрос за раз, и то лишь когда больше никто не ответил. Удачный ответ снимает паузу сразу. По умолчанию 300 (5 минут).',
        howTo: `Новое значение действует со следующей паузы, текущая доживает свой срок. ${LIVE}`,
    }),
];

export const LLM_FALLBACK_SETTINGS: readonly VendorSettingDefinition[] = [
    {
        key: 'LLM_FALLBACK_BASE_URL',
        group: 'ai-keys',
        label: 'Свой запасной поставщик разборов: адрес',
        description:
            'Любой OpenAI-совместимый сервис для разборов на случай, когда VibeCode не отвечает: Cloud.ru Evolution, Yandex AI Studio, свой сервер с vLLM или Ollama. Действует вместе с моделью и тогда важнее ключей Cloud.ru и Groq. Креды LLM в карточке портала важнее этого адреса.',
        howTo: 'Адрес до /v1 включительно, например https://foundation-models.api.cloud.ru/v1. Если сервис за рубежом, добавьте его хост в хосты прокси.',
        secret: false,
        example: 'https://foundation-models.api.cloud.ru/v1',
        validate: validateUrl,
    },
    {
        key: 'LLM_FALLBACK_API_KEY',
        group: 'ai-keys',
        label: 'Свой запасной поставщик разборов: ключ',
        description:
            'Ключ к адресу выше. Хранится зашифрованным. Для своего сервера без авторизации оставьте пустым.',
        howTo: 'Ключ выдаёт консоль поставщика, раздел API-ключей.',
        secret: true,
        example: 'ключ из консоли поставщика',
    },
    {
        key: 'LLM_FALLBACK_MODEL',
        group: 'ai-keys',
        label: 'Свой запасной поставщик разборов: модель',
        description: 'Имя модели у поставщика. Без модели адрес не действует.',
        howTo: 'Как в каталоге поставщика, например Qwen/Qwen3-235B-A22B-Instruct-2507 у Cloud.ru.',
        secret: false,
        example: 'Qwen/Qwen3-235B-A22B-Instruct-2507',
    },
    {
        key: 'LLM_FALLBACK_JSON_MODE',
        group: 'ai-keys',
        label: 'Запасной поставщик: как просить ответ в JSON',
        description:
            'json_schema — строгая схема ответа (OpenAI, vLLM, Yandex AI Studio, часть моделей Cloud.ru). json_object — только «верни JSON», схема дописывается в инструкцию: для моделей без строгой схемы. Действует для любого запасного поставщика — своего, Cloud.ru и Groq. По умолчанию json_schema.',
        howTo: 'Если запасной поставщик отвечает ошибкой про response_format или json_schema, поставьте json_object.',
        secret: false,
        example: LLM_FALLBACK_JSON_MODE_DEFAULT,
        validate: oneOf(LLM_FALLBACK_JSON_MODES),
    },
    integerSetting('LLM_FALLBACK_TIMEOUT_MS', 'ai-keys', {
        label: 'Запасной поставщик: сколько ждать ответ, мс',
        description:
            'Сколько ждать ответ запасного поставщика на один проход разбора, в миллисекундах. Действует для любого запасного поставщика — своего, Cloud.ru и Groq. По умолчанию 180 000 (3 минуты), больше 300 000 поставить нельзя.',
        howTo: LIVE,
    }),
];
