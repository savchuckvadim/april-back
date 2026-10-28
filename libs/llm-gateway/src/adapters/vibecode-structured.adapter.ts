import { Injectable } from '@nestjs/common';
import { VibeCodeClient, VibeKeyResolverService } from '@lib/vibecode';
import type {
    StructuredLlmAdapter,
    StructuredLlmRequest,
    StructuredLlmResponse,
} from '../structured-llm.types';

/**
 * VibeCode Битрикса (vibecode.bitrix24.tech, модель BitrixGPT): основной
 * провайдер сегодня. Ключ — пер-портальный vibeKey из БД; портал без
 * ключа — «не настроен», и шлюз идёт к запасному провайдеру.
 */
@Injectable()
export class VibecodeStructuredAdapter implements StructuredLlmAdapter {
    readonly code = 'vibecode' as const;

    constructor(
        private readonly client: VibeCodeClient,
        private readonly keys: VibeKeyResolverService,
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
    ): Promise<StructuredLlmResponse> {
        const apiKey = await this.keys.resolve(request.domain);
        const response = await this.client.structuredCompletionWithUsage(
            request.systemPrompt,
            request.userContent,
            request.schemaName,
            request.schema,
            apiKey,
            request.model ? { model: request.model } : undefined,
        );
        return { ...response, provider: this.code };
    }
}
