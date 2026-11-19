/**
 * Подписи и итог распознавания кусками: имя файла куска, счёт по
 * распознавателям, строка журнала. Чистые функции.
 */

/** Кусок с распознавателем и границами в секундах записи. */
export interface ProviderChunk {
    provider: string;
    startSec: number;
    endSec: number;
}

/**
 * Имя файла куска: распознаватели (OpenAI-совместимые) определяют формат
 * по расширению, поэтому у куска всегда `.mp3`.
 */
export function chunkFileName(
    fileName: string,
    index: number,
    count: number,
): string {
    const base = fileName.replace(/\.[^./\\]+$/, '') || 'call';
    const width = String(count).length;
    return `${base}.part${String(index + 1).padStart(width, '0')}of${count}.mp3`;
}

/** Сколько кусков распознал каждый. */
export function countProviders(
    chunks: readonly ProviderChunk[],
): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const chunk of chunks) {
        counts[chunk.provider] = (counts[chunk.provider] ?? 0) + 1;
    }
    return counts;
}

/** Сколько секунд записи (с нахлёстом) распознал каждый. */
export function providerSeconds(
    chunks: readonly ProviderChunk[],
): Record<string, number> {
    const seconds: Record<string, number> = {};
    for (const chunk of chunks) {
        const duration = Math.max(0, chunk.endSec - chunk.startSec);
        seconds[chunk.provider] =
            Math.round(((seconds[chunk.provider] ?? 0) + duration) * 1000) /
            1000;
    }
    return seconds;
}

export interface ChunkSummaryInput {
    callKey: string;
    chunks: number;
    chunkSec: number;
    providers: Record<string, number>;
    elapsedMs: number;
    /** Куски, взятые готовыми из прошлого запуска. */
    reused: number;
    untimed: boolean;
}

/** «Звонок X: 12 кусков по 300 с, распознали: VibeCode 11, Yandex 1 за 95 с». */
export function chunkSummaryLine(input: ChunkSummaryInput): string {
    const providers = Object.entries(input.providers)
        .map(([provider, count]) => `${provider} ${count}`)
        .join(', ');
    const extras = [
        input.reused > 0 ? `готовых из прошлого запуска ${input.reused}` : '',
        input.untimed ? 'есть куски без таймкодов' : '',
    ].filter(Boolean);
    return (
        `Звонок ${input.callKey}: ${input.chunks} кусков по ${input.chunkSec} с, ` +
        `распознали: ${providers} за ${Math.round(input.elapsedMs / 1000)} с` +
        (extras.length ? ` (${extras.join('; ')})` : '')
    );
}
