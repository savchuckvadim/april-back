/**
 * Окна запроса к ретриверу знаний.
 *
 * ЗАЧЕМ. Запрос к векторному индексу проходит через модель эмбеддингов, а у
 * GigaChat Embeddings жёсткий предел — 514 токенов на один вход. Раньше в
 * ретривер уходил ВЕСЬ транскрипт звонка, и на проде (14.09.2026) контекст
 * знаний молча выпадал из разбора: «Tokens limit exceeded for index 0:
 * 2321 (max 514)». Здесь транскрипт режется на окна по границам абзацев и
 * предложений, каждое окно укладывается в лимит, а число окон ограничено:
 * начало и конец разговора сохраняются всегда (приветствие и потребность —
 * в начале, исход и возражения — в конце), середина прореживается
 * равномерно.
 *
 * Чистые функции: без провайдера, без сети.
 */

/**
 * Предел длины одного окна в символах. Русский текст у GigaChat — примерно
 * 2,3–3 символа на токен, так что 1000 символов ≈ 350–450 токенов: запас к
 * пределу 514 с учётом цифр, латиницы и знаков препинания.
 */
export const RETRIEVAL_QUERY_MAX_CHARS = 1000;

/** Сколько окон максимум идёт в ретривер (каждое — отдельный вызов эмбеддингов). */
export const RETRIEVAL_QUERY_MAX_WINDOWS = 6;

export interface RetrievalQueryOptions {
    maxChars?: number;
    maxWindows?: number;
}

/** Границы предложений и абзацев, по которым режем текст. */
const SENTENCE_BOUNDARY = /(?<=[.!?…])\s+|\n+/;

function hardCut(text: string, maxChars: number): string[] {
    const pieces: string[] = [];
    for (let start = 0; start < text.length; start += maxChars) {
        pieces.push(text.slice(start, start + maxChars));
    }
    return pieces;
}

/** Склейка предложений в окна не длиннее maxChars. */
function packWindows(sentences: string[], maxChars: number): string[] {
    const windows: string[] = [];
    let current = '';
    for (const sentence of sentences) {
        const parts =
            sentence.length > maxChars
                ? hardCut(sentence, maxChars)
                : [sentence];
        for (const part of parts) {
            const candidate = current ? `${current} ${part}` : part;
            if (candidate.length <= maxChars) {
                current = candidate;
                continue;
            }
            if (current) windows.push(current);
            current = part;
        }
    }
    if (current) windows.push(current);
    return windows;
}

/**
 * Равномерная выборка окон с обязательными первым и последним: индексы
 * k·(n−1)/(m−1) для k = 0…m−1.
 */
function sampleEvenly(windows: string[], maxWindows: number): string[] {
    if (windows.length <= maxWindows) return windows;
    if (maxWindows <= 1) return [windows[0]];
    const last = windows.length - 1;
    const picked = new Set<number>();
    for (let k = 0; k < maxWindows; k += 1) {
        picked.add(Math.round((k * last) / (maxWindows - 1)));
    }
    return [...picked].sort((a, b) => a - b).map(index => windows[index]);
}

/**
 * Окна запроса по транскрипту: короткий текст уходит как есть, длинный —
 * набором окон не длиннее `maxChars`, не больше `maxWindows` штук.
 */
export function buildRetrievalQueries(
    transcript: string,
    options: RetrievalQueryOptions = {},
): string[] {
    const maxChars = options.maxChars ?? RETRIEVAL_QUERY_MAX_CHARS;
    const maxWindows = options.maxWindows ?? RETRIEVAL_QUERY_MAX_WINDOWS;
    const text = transcript.trim();
    if (text.length <= maxChars) return [text];
    const sentences = text
        .split(SENTENCE_BOUNDARY)
        .map(part => part.trim())
        .filter(part => part.length > 0);
    return sampleEvenly(packWindows(sentences, maxChars), maxWindows);
}

/**
 * Слияние выдач по окнам «по кругу»: первые результаты каждого окна идут
 * раньше вторых, дубли по тексту отбрасываются, итог ограничен `limit`.
 */
export function mergeRoundRobin<T>(
    lists: readonly (readonly T[])[],
    keyOf: (item: T) => string,
    limit: number,
): T[] {
    const merged: T[] = [];
    const seen = new Set<string>();
    const longest = Math.max(0, ...lists.map(list => list.length));
    for (let rank = 0; rank < longest; rank += 1) {
        for (const list of lists) {
            const item = list[rank];
            if (item === undefined) continue;
            const key = keyOf(item);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            merged.push(item);
            if (merged.length >= limit) return merged;
        }
    }
    return merged;
}
