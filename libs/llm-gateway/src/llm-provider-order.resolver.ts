import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PortalAiSettingsService } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.service';
import {
    normalizeProviderOrder,
    resolveProviderOrder,
} from './llm-provider-order.util';
import type { LlmProviderCode } from './structured-llm.types';

/** TTL кэша порядка домена, мс: разбор звонка — несколько вызовов подряд. */
const CACHE_TTL_MS = 60_000;

/**
 * Чей порядок провайдеров действует для домена: настройка портала
 * `llmProviderOrder` (админка → настройки AI портала) важнее общего env
 * LLM_PROVIDER_ORDER. Так портал со своим ключом считает разборы у себя
 * (`['openai-compatible', 'vibecode']`), а остальные — как приложение.
 * Ошибка чтения настроек не роняет вызов — действует общий порядок.
 *
 * `@Injectable` без bitrix-состояния: домен приходит параметром.
 */
@Injectable()
export class LlmProviderOrderResolver {
    private readonly logger = new Logger(LlmProviderOrderResolver.name);
    /** Общий порядок приложения (env); он же ответ при ошибке чтения портала. */
    readonly fallbackOrder: LlmProviderCode[];
    private readonly cache = new Map<
        string,
        { order: LlmProviderCode[]; expiresAt: number }
    >();

    constructor(
        configService: ConfigService,
        private readonly portalAiSettings: PortalAiSettingsService,
    ) {
        this.fallbackOrder = resolveProviderOrder(
            configService.get<string>('LLM_PROVIDER_ORDER'),
        );
    }

    /** Порядок провайдеров для домена: портал → общий. */
    async orderFor(domain: string): Promise<LlmProviderCode[]> {
        const cached = this.cache.get(domain);
        if (cached && cached.expiresAt > Date.now()) return cached.order;
        const order = (await this.portalOrder(domain)) ?? this.fallbackOrder;
        this.cache.set(domain, { order, expiresAt: Date.now() + CACHE_TTL_MS });
        return order;
    }

    /** Сброс кэша после правки настроек портала; без домена — весь. */
    invalidate(domain?: string): void {
        if (domain === undefined) this.cache.clear();
        else this.cache.delete(domain);
    }

    private async portalOrder(
        domain: string,
    ): Promise<LlmProviderCode[] | null> {
        try {
            const record = await this.portalAiSettings.getByDomain(domain);
            return normalizeProviderOrder(record?.llmProviderOrder ?? []);
        } catch (error) {
            this.logger.warn(
                `Порядок провайдеров LLM портала ${domain} не прочитан (${(error as Error).message}) — общий порядок`,
            );
            return null;
        }
    }
}
