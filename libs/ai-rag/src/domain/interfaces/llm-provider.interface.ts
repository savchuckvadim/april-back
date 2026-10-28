/** Результат объединённого анализа звонка (резюме + рекомендации одним вызовом). */
export interface CallAnalysisPair {
    resume: string;
    recomendation: string;
}

export interface LlmProvider {
    resume(query: string, domain?: string): Promise<string>;
    recomendation(query: string, domain?: string): Promise<string>;
    /**
     * Резюме + рекомендации ОДНИМ вызовом LLM (экономия ~50% токенов
     * относительно двух раздельных вызовов). Провайдер обязан сам
     * откатиться на два раздельных вызова, если объединённый ответ
     * не удалось распарсить.
     */
    analyzeCall(query: string, domain?: string): Promise<CallAnalysisPair>;
    /**
     * Произвольный вызов «системный промпт + сообщение» → текст ответа: без
     * RAG-цепочек, базы знаний и маркеров секций. Нужен шлюзу структурных
     * вызовов (@lib/llm-gateway — третий эшелон после VibeCode и
     * OpenAI-совместимого endpoint'а) и ручкам «любой промпт». Лимитер
     * одновременных запросов и ошибки ключа — на провайдере
     * (план устойчивости к провайдерам 28.10.2026).
     */
    complete(systemPrompt: string, userContent: string): Promise<string>;
}
