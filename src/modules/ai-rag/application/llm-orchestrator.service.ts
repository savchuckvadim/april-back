import { Injectable } from '@nestjs/common';
import { LlmProvider } from '../domain/interfaces/llm-provider.interface';
import { LlmModel } from '../domain/types/llm-model.type';
import { FakeProvider } from '../infrastructure/providers/fake.provider';
import { GigaChatProvider } from '../infrastructure/providers/gigachat.provider';
import { OllamaProvider } from '../infrastructure/providers/ollama.provider';
import { OpenAiProvider } from '../infrastructure/providers/openai.provider';

@Injectable()
export class LlmOrchestratorService {
    constructor(
        private readonly gigaChatProvider: GigaChatProvider,
        private readonly openAiProvider: OpenAiProvider,
        private readonly ollamaProvider: OllamaProvider,
        private readonly fakeProvider: FakeProvider,
    ) {}

    resume(model: LlmModel, query: string, domain?: string): Promise<string> {
        return this.resolveProvider(model).resume(query, domain);
    }

    recomendation(
        model: LlmModel,
        query: string,
        domain?: string,
    ): Promise<string> {
        return this.resolveProvider(model).recomendation(query, domain);
    }

    private resolveProvider(model: LlmModel): LlmProvider {
        switch (model) {
            case 'gigachat':
                return this.gigaChatProvider;
            case 'openai':
                return this.openAiProvider;
            case 'ollama':
                return this.ollamaProvider;
            case 'fake':
                return this.fakeProvider;
        }
    }
}
