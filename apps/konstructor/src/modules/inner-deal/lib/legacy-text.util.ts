/**
 * Текст из колонки, куда легаси-конструктор мог записать объект поля ввода
 * JSON-строкой (`{"value":""}` в `bx_document_deals.dealName`). Достаём
 * `value`; пусто — null, чтобы список не показывал «{"value":""}».
 */
export const legacyText = (raw: string | null | undefined): string | null => {
    const text = raw?.trim();
    if (!text) return null;
    if (!text.startsWith('{')) return text;
    try {
        const parsed: unknown = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && 'value' in parsed) {
            const value = (parsed as { value: unknown }).value;
            return typeof value === 'string' && value.trim()
                ? value.trim()
                : null;
        }
    } catch {
        // не JSON — обычный текст, начинающийся со скобки
    }
    return text;
};
