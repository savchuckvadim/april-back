import { SupportDialogReport } from '../../monitor/application/support-monitor.report';

export interface SupportDialogMatch {
    /** Единственный подходящий; null — не нашли или нашли несколько. */
    dialog: SupportDialogReport | null;
    /** Подходящие, когда их больше одного. */
    candidates: SupportDialogReport[];
}

/** Слова короче — сравниваем целиком: «Ким», «ООО». */
const STEM_MIN_LENGTH = 5;
/** Падежное окончание: «Соломатову» → «Соломато» найдёт «Соломатова». */
const STEM_CUT = 2;

const tokens = (text: string): string[] =>
    text
        .toLowerCase()
        .replace(/ё/gu, 'е')
        .split(/[^a-zа-я0-9]+/u)
        .filter(Boolean);

const stem = (token: string): string =>
    token.length >= STEM_MIN_LENGTH
        ? token.slice(0, token.length - STEM_CUT)
        : token;

/** Каждое слово запроса — начало какого-то слова имени (без окончания). */
function nameMatches(name: string, query: string): boolean {
    const nameTokens = tokens(name);
    return tokens(query).every(word => {
        const prefix = stem(word);
        return nameTokens.some(part => part.startsWith(prefix));
    });
}

/**
 * Диалог по запросу человека: номер чата или сессии, часть имени клиента
 * или его портала. Пустой запрос — единственный открытый диалог, если он
 * один. Падеж имени не важен («разбери Соломатову»).
 */
export function findDialogByQuery(
    dialogs: readonly SupportDialogReport[],
    query: string,
): SupportDialogMatch {
    const text = query.trim();
    if (!text) {
        return dialogs.length === 1
            ? { dialog: dialogs[0] ?? null, candidates: [] }
            : { dialog: null, candidates: [] };
    }
    if (/^\d+$/u.test(text)) {
        const id = Number(text);
        const found =
            dialogs.find(dialog => dialog.chatId === id) ??
            dialogs.find(dialog => dialog.sessionId === id) ??
            null;
        return { dialog: found, candidates: [] };
    }
    const lower = text.toLowerCase();
    const candidates = dialogs.filter(
        dialog =>
            nameMatches(dialog.clientName, text) ||
            (dialog.clientPortal?.toLowerCase().includes(lower) ?? false),
    );
    return candidates.length === 1
        ? { dialog: candidates[0] ?? null, candidates: [] }
        : { dialog: null, candidates };
}
