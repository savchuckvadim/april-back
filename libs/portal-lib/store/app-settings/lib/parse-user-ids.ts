/**
 * Разбор настройки-списка Bitrix ID («1, 42;107» → [1, 42, 107]).
 * Разделители — запятая, точка с запятой, пробелы; мусор, нули,
 * отрицательные и дубли отбрасываются. Общий парсер для всех ключей
 * реестра вида `*_user_ids` (skap.notify_user_ids, sales.visibility_*).
 */
export const parseUserIds = (raw: string | null | undefined): number[] => {
    const result: number[] = [];
    const seen = new Set<number>();
    for (const part of String(raw ?? '').split(/[,;\s]+/)) {
        if (!part) continue;
        const id = Number(part);
        if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
        seen.add(id);
        result.push(id);
    }
    return result;
};
