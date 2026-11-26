import {
    LONG_CALL_BLOCK_SEPARATOR,
    LONG_CALL_DROPPED_PREFIX,
    LONG_CALL_EXCERPTS_TITLE,
    LONG_CALL_HEAD_HEADING,
    LONG_CALL_HEADER_BODY,
    LONG_CALL_HEADER_TITLE,
    LONG_CALL_LINE_SEPARATOR,
    LONG_CALL_SECONDS_PER_MINUTE,
    LONG_CALL_TAIL_HEADING,
} from './long-call-input.const';
import { rangeTexts } from './long-call-input-lines.util';
import type {
    LineRange,
    PreparedTranscript,
    SelectedExcerpts,
} from './long-call-input.types';

/**
 * Сборка текста потребителя из блоков: шапка, сводка, конспект по частям,
 * дословные отрывки. Строки расшифровки печатаются без изменений.
 *
 * Чистые функции: без DI, Bitrix и Prisma.
 */

/**
 * Шапка. Длительность — по последней метке времени, до минут; меток нет —
 * без скобок.
 */
export function buildLongCallHeader(lastSec: number | null): string {
    const duration =
        lastSec === null
            ? ''
            : ` (${Math.round(lastSec / LONG_CALL_SECONDS_PER_MINUTE)} мин)`;

    return `${LONG_CALL_HEADER_TITLE}${duration}${LONG_CALL_HEADER_BODY}`;
}

/** Подзаголовок отрывка: «— 12:05–13:40: зачем читать —». */
const sectionHeading = (heading: string): string => `— ${heading} —`;

/** Подзаголовок и строки диапазона дословно. */
function section(
    transcript: PreparedTranscript,
    heading: string,
    range: LineRange,
): string[] {
    return [sectionHeading(heading), ...rangeTexts(transcript, range)];
}

/**
 * Блок «ДОСЛОВНЫЕ ОТРЫВКИ»: начало, отрывки по времени, конец и, если что-то
 * не поместилось, сколько не вошло. Нечего печатать — null (блока нет).
 */
export function buildExcerptsText(
    transcript: PreparedTranscript,
    selected: SelectedExcerpts,
): string | null {
    const body: string[] = [
        ...(selected.head
            ? section(transcript, LONG_CALL_HEAD_HEADING, selected.head)
            : []),
        ...selected.groups.flatMap(group =>
            section(transcript, group.heading, group.range),
        ),
        ...(selected.tail
            ? section(transcript, LONG_CALL_TAIL_HEADING, selected.tail)
            : []),
    ];
    if (selected.dropped > 0) {
        body.push(`${LONG_CALL_DROPPED_PREFIX}${selected.dropped}.`);
    }
    if (body.length === 0) return null;

    return [LONG_CALL_EXCERPTS_TITLE, ...body].join(LONG_CALL_LINE_SEPARATOR);
}

/** Блоки по порядку через пустую строку; отсутствующие блоки пропускаются. */
export function joinBlocks(blocks: readonly (string | null)[]): string {
    return blocks
        .filter((block): block is string => block !== null)
        .join(LONG_CALL_BLOCK_SEPARATOR);
}
