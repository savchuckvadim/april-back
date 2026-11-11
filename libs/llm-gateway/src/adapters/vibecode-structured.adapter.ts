import { Injectable } from '@nestjs/common';
import { VibeCodeClient, VibeKeyResolverService } from '@lib/vibecode';
import { KeyedConcurrencyLimiter } from '../llm-concurrency.util';
import { LlmGatewaySettingsService } from '../llm-gateway-settings.service';
import { vibecodeConcurrencyOf } from '../llm-gateway-settings.util';
import type {
    LlmSendGuard,
    StructuredLlmAdapter,
    StructuredLlmRequest,
    StructuredLlmResponse,
} from '../structured-llm.types';

/**
 * VibeCode Битрикса (vibecode.bitrix24.tech, модель BitrixGPT): основной
 * провайдер сегодня. Ключ — пер-портальный vibeKey из БД; портал без
 * ключа — «не настроен», и шлюз идёт к запасному провайдеру.
 *
 * Запросы к модели идут через ограничитель (11.11.2026): одновременно не
 * больше заданного на ключ портала (по умолчанию 6) и на процесс (12),
 * остальные ждут слота по очереди. Пределы — «Настройки приложения» в
 * админке, перечитываются на каждом вызове (кэш читателя — минута).
 * Ожидание уходит в `queueMs` ответа — журнал шлюза пишет его отдельно от
 * времени ответа модели.
 */
@Injectable()
export class VibecodeStructuredAdapter implements StructuredLlmAdapter {
    readonly code = 'vibecode' as const;
    /** Один на процесс: адаптер — синглтон модуля шлюза. */
    private readonly limiter = new KeyedConcurrencyLimiter(
        vibecodeConcurrencyOf({}),
    );

    constructor(
        private readonly client: VibeCodeClient,
        private readonly keys: VibeKeyResolverService,
        private readonly settings: LlmGatewaySettingsService,
    ) {}

    async configurationIssue(domain: string): Promise<string | null> {
        try {
            await this.keys.resolve(domain);
            return null;
        } catch (error) {
            return (error as Error).message;
        }
    }

    async complete(
        request: StructuredLlmRequest,
        guard?: LlmSendGuard,
    ): Promise<StructuredLlmResponse> {
        const apiKey = await this.keys.resolve(request.domain);
        this.limiter.setLimits(await this.settings.vibecodeConcurrency());
        // Клиент вызывается только внутри слота: AbortSignal.timeout
        // (срок ответа на разбор) он создаёт в момент fetch, так что таймаут
        // меряет работу модели, а не очередь. Ожидание слота ошибок не
        // бросает — предохранитель шлюза его не видит. Дождавшись слота,
        // спрашиваем шлюз, не встал ли поставщик на паузу, пока мы ждали:
        // встал — запрос не уходит, слот сразу свободен.
        const { value, queueMs } = await this.limiter.run(apiKey, async () => {
            await guard?.beforeSend();
            return this.client.structuredCompletionWithUsage(
                request.systemPrompt,
                request.userContent,
                request.schemaName,
                request.schema,
                apiKey,
                request.model ? { model: request.model } : undefined,
            );
        });
        return { ...value, provider: this.code, queueMs };
    }
}
