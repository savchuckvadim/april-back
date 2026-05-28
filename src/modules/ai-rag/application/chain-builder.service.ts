import { Injectable } from '@nestjs/common';
import {
    ChatPromptTemplate,
    MessagesPlaceholder,
} from '@langchain/core/prompts';
import { BaseRetrieverInterface } from '@langchain/core/retrievers';
import { LanguageModelLike } from '@langchain/core/language_models/base';
import { createHistoryAwareRetriever } from 'langchain/chains/history_aware_retriever';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import {
    CONTEXTUALIZE_PROMPT,
    RECOMMENDATION_SYSTEM_PROMPT,
    RESUME_SYSTEM_PROMPT,
} from '../domain/prompts/prompts';
import { AiChain } from '../domain/types/ai-chain.types';

type PromptMessage = [string, string] | MessagesPlaceholder;

@Injectable()
export class ChainBuilderService {
    async buildResumeChain(
        llm: LanguageModelLike,
        retriever: BaseRetrieverInterface,
        withHistory = false,
    ): Promise<AiChain> {
        return this.buildChain(
            llm,
            retriever,
            RESUME_SYSTEM_PROMPT,
            withHistory,
        );
    }

    async buildRecommendationChain(
        llm: LanguageModelLike,
        retriever: BaseRetrieverInterface,
        withHistory = false,
    ): Promise<AiChain> {
        return this.buildChain(
            llm,
            retriever,
            RECOMMENDATION_SYSTEM_PROMPT,
            withHistory,
        );
    }

    private async buildChain(
        llm: LanguageModelLike,
        retriever: BaseRetrieverInterface,
        systemPrompt: string,
        withHistory: boolean,
    ): Promise<AiChain> {
        const qaPrompt = this.buildPrompt(systemPrompt, withHistory);
        const documentChain = await createStuffDocumentsChain({
            llm,
            prompt: qaPrompt,
        });

        if (!withHistory) {
            return (await createRetrievalChain({
                retriever,
                combineDocsChain: documentChain,
            })) as unknown as AiChain;
        }

        const historyPrompt = this.buildContextualizePrompt();
        const historyAwareRetriever = await createHistoryAwareRetriever({
            llm,
            retriever,
            rephrasePrompt: historyPrompt,
        });
        return (await createRetrievalChain({
            retriever: historyAwareRetriever,
            combineDocsChain: documentChain,
        })) as unknown as AiChain;
    }

    private buildPrompt(
        systemPrompt: string,
        withHistory: boolean,
    ): ChatPromptTemplate {
        const messages: PromptMessage[] = [['system', systemPrompt]];
        if (withHistory) {
            messages.push(new MessagesPlaceholder('chat_history'));
        }
        messages.push(['human', '{input}']);
        return ChatPromptTemplate.fromMessages(messages);
    }

    private buildContextualizePrompt(): ChatPromptTemplate {
        return ChatPromptTemplate.fromMessages([
            ['system', CONTEXTUALIZE_PROMPT],
            new MessagesPlaceholder('chat_history'),
            ['human', '{input}'],
        ]);
    }
}
