/**
 * Схема в системном промпте — для провайдеров без structured output
 * (режим json_object у OpenAI-совместимых endpoint'ов, модели оркестратора
 * контура 1). Строгая схема в response_format надёжнее; это — запасной путь.
 */
export function withJsonInstruction(
    systemPrompt: string,
    schema: Record<string, unknown>,
): string {
    return `${systemPrompt}\n\nОтвечай ТОЛЬКО одним JSON-объектом по этой схеме, без пояснений и без markdown:\n${JSON.stringify(schema)}`;
}
