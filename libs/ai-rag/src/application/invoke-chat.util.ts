import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { extractMessageContent } from './extract-message-content.util';

/**
 * Один вызов чат-модели «системный промпт + сообщение» → текст ответа.
 * Общая реализация `LlmProvider.complete` для всех провайдеров: без
 * цепочек, ретриверов и маркеров — ровно то, что нужно шлюзу структурных
 * вызовов и ручке «любой промпт».
 */
export async function invokeChat(
    llm: BaseChatModel,
    systemPrompt: string,
    userContent: string,
): Promise<string> {
    const response = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userContent),
    ]);
    return extractMessageContent(response);
}
