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
}
