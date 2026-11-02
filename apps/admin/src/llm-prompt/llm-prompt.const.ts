import type { LlmModel } from '@lib/ai-rag';
import type { LlmProviderCode } from '@lib/llm-gateway';

/** Базовый путь и тег Swagger ручки «любой промпт любой моделью». */
export const LLM_PROMPT_ADMIN_PATH = 'admin/llm-prompt';
export const LLM_PROMPT_ADMIN_TAG = 'Admin LLM Prompt';

/**
 * Исполнители произвольного промпта.
 * - `auto` — порядок провайдеров разборов портала (или общий приложения):
 *   отвечает первый живой и настроенный, как при разборе звонка;
 * - `vibecode`, `openai-compatible` — один провайдер шлюза разборов;
 * - модели контура резюме (`gigachat`, `cloudru`, `openai`, `ollama`) —
 *   напрямую через оркестратор, обычным текстом, без схемы ответа.
 */
export const LLM_PROMPT_GATEWAY_TARGETS = [
    'auto',
    'vibecode',
    'openai-compatible',
] as const;
export const LLM_PROMPT_MODEL_TARGETS = [
    'gigachat',
    'cloudru',
    'openai',
    'ollama',
] as const satisfies readonly LlmModel[];
export const LLM_PROMPT_TARGETS = [
    ...LLM_PROMPT_GATEWAY_TARGETS,
    ...LLM_PROMPT_MODEL_TARGETS,
] as const;

export type LlmPromptGatewayTarget =
    (typeof LLM_PROMPT_GATEWAY_TARGETS)[number];
export type LlmPromptModelTarget = (typeof LLM_PROMPT_MODEL_TARGETS)[number];
export type LlmPromptTarget = (typeof LLM_PROMPT_TARGETS)[number];

/** Чем является исполнитель: провайдер шлюза разборов или модель контура резюме. */
export const LLM_PROMPT_TARGET_KINDS = ['gateway', 'model'] as const;
export type LlmPromptTargetKind = (typeof LLM_PROMPT_TARGET_KINDS)[number];

export const isLlmPromptTarget = (value: unknown): value is LlmPromptTarget =>
    typeof value === 'string' &&
    (LLM_PROMPT_TARGETS as readonly string[]).includes(value);

export const isLlmPromptModelTarget = (
    target: LlmPromptTarget,
): target is LlmPromptModelTarget =>
    (LLM_PROMPT_MODEL_TARGETS as readonly string[]).includes(target);

/** Провайдер шлюза, которого выбирает цель; `auto` — порядок портала. */
export const LLM_PROMPT_GATEWAY_PROVIDER: Readonly<
    Record<LlmPromptGatewayTarget, LlmProviderCode | null>
> = {
    auto: null,
    vibecode: 'vibecode',
    'openai-compatible': 'openai-compatible',
};

export interface LlmPromptTargetMeta {
    title: string;
    description: string;
    kind: LlmPromptTargetKind;
    /** Принимает ли исполнитель имя модели из запроса. */
    acceptsModel: boolean;
}

/** Подписи исполнителей — их читает форма в админке. */
export const LLM_PROMPT_TARGET_META: Readonly<
    Record<LlmPromptTarget, LlmPromptTargetMeta>
> = {
    auto: {
        title: 'Как разборы звонков',
        description:
            'Порядок провайдеров портала (или общий приложения): VibeCode, ' +
            'затем запасной OpenAI-совместимый сервис. Отвечает первый ' +
            'живой и настроенный — так же считаются разборы звонков.',
        kind: 'gateway',
        acceptsModel: true,
    },
    vibecode: {
        title: 'VibeCode Битрикса',
        description:
            'Ключ VibeCode портала. Без портала недоступен. Можно указать ' +
            'имя модели, как в настройке «Модель глубокого разбора».',
        kind: 'gateway',
        acceptsModel: true,
    },
    'openai-compatible': {
        title: 'OpenAI-совместимый сервис',
        description:
            'Свой сервис портала (ключи llmBaseUrl / llmKey / llmModelName) ' +
            'или общий запасной приложения: Cloud.ru либо Groq из настроек ' +
            'приложения; зарубежные адреса идут через исходящий прокси.',
        kind: 'gateway',
        acceptsModel: false,
    },
    gigachat: {
        title: 'GigaChat',
        description:
            'Модель контура резюме, ключ приложения из окружения. Обычный ' +
            'текст без схемы ответа.',
        kind: 'model',
        acceptsModel: false,
    },
    cloudru: {
        title: 'Cloud.ru',
        description:
            'Модель контура резюме, ключ приложения из окружения. Обычный ' +
            'текст без схемы ответа.',
        kind: 'model',
        acceptsModel: false,
    },
    openai: {
        title: 'OpenAI',
        description:
            'Модель контура резюме, ключ приложения из окружения. Обычный ' +
            'текст без схемы ответа.',
        kind: 'model',
        acceptsModel: false,
    },
    ollama: {
        title: 'Ollama (своя модель)',
        description:
            'Локальная модель контура резюме по адресу из окружения ' +
            'приложения. Обычный текст без схемы ответа.',
        kind: 'model',
        acceptsModel: false,
    },
};

/** Домен-заглушка без портала: ключи портала не читаются, действуют общие. */
export const LLM_PROMPT_NO_PORTAL_DOMAIN = 'admin.april-app.ru';

/** Системный промпт, если админ его не задал. */
export const LLM_PROMPT_DEFAULT_SYSTEM =
    'Ты — внимательный ассистент. Отвечай по существу, на русском языке, без вступлений.';

/** Имя схемы ответа для шлюза: вызовы ручки видны в логах по нему. */
export const LLM_PROMPT_SCHEMA_NAME = 'admin_free_prompt';

/** Пределы полей запроса — зеркало валидации DTO. */
export const LLM_PROMPT_LIMITS = {
    domain: 255,
    systemPrompt: 50_000,
    userContent: 400_000,
    model: 200,
} as const;

export const LLM_PROMPT_TEXT = {
    vibecodeNeedsPortal: 'нужен портал: ключ VibeCode хранится у портала',
    failed: 'Модель не ответила',
} as const;
