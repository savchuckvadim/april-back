import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GROQ_BASE_URL, groqPresetOf } from '@lib/ai-presets';
import { PortalKeysService } from '@lib/portal-lib/store/keys/portal-keys.service';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';

/** Откуда взят endpoint: свои креды портала или общий env. */
export type LlmEndpointSource = 'portal' | 'env';

/** OpenAI-совместимый endpoint запасного провайдера. */
export interface LlmEndpoint {
    /** Базовый адрес без хвостового слэша (`https://…/v1`). */
    baseUrl: string;
    /** Ключ; null — endpoint без авторизации (свой vLLM в контуре). */
    apiKey: string | null;
    model: string;
    source: LlmEndpointSource;
}

/** TTL кэша endpoint'а домена, мс: ключи портала не читаем из БД на каждый вызов. */
const CACHE_TTL_MS = 60_000;

/**
 * Дефолты Cloud.ru Evolution — те же, что у провайдера контура 1
 * (`libs/ai-rag/.../cloudru.provider.ts`, константы там не экспортируются):
 * если Cloud.ru уже настроен ключом CLOUDRU_API_KEY, шлюзу отдельных
 * LLM_FALLBACK_* не нужно.
 */
const CLOUDRU_DEFAULT_BASE_URL = 'https://foundation-models.api.cloud.ru/v1';
const CLOUDRU_DEFAULT_MODEL = 'Qwen/Qwen3-235B-A22B-Instruct-2507';

/**
 * Запасной endpoint из env: явные LLM_FALLBACK_*, иначе Cloud.ru контура 1
 * (в РФ — важнее), иначе Groq по одному ключу GROQ_API_KEY (@lib/ai-presets;
 * за рубежом — через исходящий прокси).
 */
export function envEndpointOf(
    get: (key: string) => string | undefined,
): LlmEndpoint | null {
    const explicit = endpointOf(
        get('LLM_FALLBACK_BASE_URL'),
        get('LLM_FALLBACK_API_KEY'),
        get('LLM_FALLBACK_MODEL'),
        'env',
    );
    if (explicit) return explicit;
    const cloudRuKey = get('CLOUDRU_API_KEY');
    if (cloudRuKey?.trim()) {
        return endpointOf(
            get('CLOUDRU_BASE_URL') ?? CLOUDRU_DEFAULT_BASE_URL,
            cloudRuKey,
            get('CLOUDRU_MODEL') ?? CLOUDRU_DEFAULT_MODEL,
            'env',
        );
    }
    const groq = groqPresetOf(get);
    return groq
        ? endpointOf(GROQ_BASE_URL, groq.apiKey, groq.llmModel, 'env')
        : null;
}

/**
 * Endpoint собран, если есть и адрес, и модель; ключ необязателен.
 * Хвостовые слэши адреса снимаются — путь `/chat/completions` добавляет адаптер.
 */
export function endpointOf(
    baseUrl: string | null | undefined,
    apiKey: string | null | undefined,
    model: string | null | undefined,
    source: LlmEndpointSource,
): LlmEndpoint | null {
    const url = (baseUrl ?? '').trim().replace(/\/+$/, '');
    const name = (model ?? '').trim();
    if (!url || !name) return null;
    const key = (apiKey ?? '').trim();
    return { baseUrl: url, apiKey: key || null, model: name, source };
}

/**
 * Где запасной провайдер LLM отвечает домену: свои креды портала
 * (Portal.keys.llmBaseUrl / llmKey / llmModelName — колонки заведены под
 * «собственную LLM клиента») важнее общего env LLM_FALLBACK_BASE_URL /
 * LLM_FALLBACK_API_KEY / LLM_FALLBACK_MODEL, а тот — важнее Cloud.ru
 * контура 1 (CLOUDRU_API_KEY), последним идёт Groq (GROQ_API_KEY).
 * Ничего нет — null, и шлюз провайдера пропускает.
 *
 * `@Injectable` без bitrix-состояния: домен приходит параметром.
 */
@Injectable()
export class LlmEndpointResolverService {
    private readonly logger = new Logger(LlmEndpointResolverService.name);
    private readonly env: LlmEndpoint | null;
    private readonly cache = new Map<
        string,
        { endpoint: LlmEndpoint | null; expiresAt: number }
    >();

    constructor(
        configService: ConfigService,
        private readonly portalStore: PortalStoreService,
        private readonly portalKeys: PortalKeysService,
    ) {
        this.env = envEndpointOf(key => configService.get<string>(key));
    }

    /** Endpoint домена; null — запасной провайдер не настроен. */
    async resolve(domain: string): Promise<LlmEndpoint | null> {
        const cached = this.cache.get(domain);
        if (cached && cached.expiresAt > Date.now()) return cached.endpoint;

        const endpoint = (await this.portalEndpoint(domain)) ?? this.env;
        this.cache.set(domain, {
            endpoint,
            expiresAt: Date.now() + CACHE_TTL_MS,
        });
        return endpoint;
    }

    /** Сброс кэша после смены ключей портала в админке; без домена — весь. */
    invalidate(domain?: string): void {
        if (domain === undefined) this.cache.clear();
        else this.cache.delete(domain);
    }

    /** Свои креды портала; ошибка чтения не роняет вызов — берём env. */
    private async portalEndpoint(domain: string): Promise<LlmEndpoint | null> {
        try {
            const portal = await this.portalStore.getPortalByDomain(domain);
            if (!portal) return null;
            const id = Number(portal.id);
            const [baseUrl, apiKey, model] = await Promise.all([
                this.portalKeys.get(id, 'llmBaseUrl'),
                this.portalKeys.get(id, 'llmKey'),
                this.portalKeys.get(id, 'llmModelName'),
            ]);
            return endpointOf(baseUrl, apiKey, model, 'portal');
        } catch (error) {
            this.logger.warn(
                `Креды LLM портала ${domain} не прочитаны (${(error as Error).message}) — берём общий endpoint`,
            );
            return null;
        }
    }
}
