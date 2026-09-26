/**
 * Сегменты транскрипции с таймкодами (план Фазы 3 AI-аналитики, поток П6
 * `p3-transcript-segments`): разбор звонка ссылается на секунды записи,
 * чтобы руководитель открывал запись в нужном месте.
 *
 * Хранятся в JSON-колонке `transcriptions.segments` (миграция в проекте
 * `online`), в UF-поля смарта не пишутся — лимит строки смарта. Старые
 * строки без сегментов читаются как прежде: `segments = null`.
 *
 * Чистые типы и функции: без DI, Bitrix и Prisma.
 */

/** Кто говорит в сегменте; моно-запись без диаризации — unknown. */
export const TRANSCRIPT_SPEAKERS = ['manager', 'client', 'unknown'] as const;
export type TranscriptSpeaker = (typeof TRANSCRIPT_SPEAKERS)[number];

export interface TranscriptSegment {
    /** Начало сегмента от начала записи, секунды (≥ 0). */
    startSec: number;
    /** Конец сегмента, секунды (≥ startSec). */
    endSec: number;
    speaker: TranscriptSpeaker;
    text: string;
}

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const isSpeaker = (value: unknown): value is TranscriptSpeaker =>
    typeof value === 'string' &&
    (TRANSCRIPT_SPEAKERS as readonly string[]).includes(value);

/**
 * Сегменты из JSON-колонки: чужая или неполная запись отбрасывается
 * поштучно, не-массив даёт null (строка до появления колонки).
 */
export function parseTranscriptSegments(
    value: unknown,
): TranscriptSegment[] | null {
    if (!Array.isArray(value)) return null;
    const segments: TranscriptSegment[] = [];
    for (const item of value) {
        if (typeof item !== 'object' || item === null) continue;
        const record = item as Record<string, unknown>;
        if (
            !isFiniteNumber(record.startSec) ||
            !isFiniteNumber(record.endSec) ||
            typeof record.text !== 'string' ||
            record.startSec < 0 ||
            record.endSec < record.startSec
        ) {
            continue;
        }
        segments.push({
            startSec: record.startSec,
            endSec: record.endSec,
            speaker: isSpeaker(record.speaker) ? record.speaker : 'unknown',
            text: record.text,
        });
    }

    return segments;
}

/** Секунды → 'mm:ss' (часы уходят в минуты: 1:05:03 → 65:03). */
export function formatTimecode(sec: number): string {
    const total = Math.max(0, Math.round(sec));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Подпись говорящего в расшифровке для модели. */
const SPEAKER_LABELS: Record<TranscriptSpeaker, string> = {
    manager: 'Менеджер',
    client: 'Клиент',
    unknown: '',
};

/**
 * Расшифровка с таймкодами для промпта разбора: одна строка на сегмент
 * `[mm:ss] Говорящий: текст`. Модель ссылается на эти метки в
 * `objections[].startSec`, поэтому формат один на все проходы разбора.
 * Пустой список — пустая строка (вызывающий подставит обычный текст).
 */
export function renderTranscriptWithTimecodes(
    segments: readonly TranscriptSegment[],
): string {
    return segments
        .map(segment => {
            const label = SPEAKER_LABELS[segment.speaker];
            const prefix = label ? `${label}: ` : '';

            return `[${formatTimecode(segment.startSec)}] ${prefix}${segment.text.trim()}`;
        })
        .filter(line => line.length > 0)
        .join('\n');
}

/**
 * Таймкод внутри длительности записи (с запасом в одну секунду на
 * округление телефонии); длительность неизвестна — проверять нечем.
 */
export function isTimecodeWithinDuration(
    sec: number,
    durationSec: number | null,
): boolean {
    if (!isFiniteNumber(sec) || sec < 0) return false;
    if (durationSec === null || !isFiniteNumber(durationSec)) return true;

    return sec <= durationSec + 1;
}
