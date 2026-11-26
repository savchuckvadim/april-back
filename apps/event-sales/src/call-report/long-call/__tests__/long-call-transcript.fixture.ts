import { formatTimecode } from '@lib/call-lib';
import type { TranscriptPart } from '../long-call.types';

/**
 * Расшифровки для тестов резки: строки в том же формате, что
 * renderTranscriptWithTimecodes в call-lib (`[мм:сс] Менеджер: текст`).
 */

const SPEAKERS = ['Менеджер', 'Клиент'] as const;
const FILLER = 'слово ';
const MIN_STEP_SEC = 5;
const STEP_SPREAD_SEC = 6;
const MIN_TEXT_CHARS = 40;
const TEXT_SPREAD_CHARS = 60;

/**
 * Строки живой записи примерно на totalChars знаков: метки каждые 5–10
 * секунд, у реплик разная длина, каждая строка уникальна.
 */
export function generateTranscriptLines(totalChars: number): string[] {
    const lines: string[] = [];
    let chars = 0;
    let sec = 0;
    for (let index = 0; chars < totalChars; index++) {
        sec += MIN_STEP_SEC + ((index * 7) % STEP_SPREAD_SEC);
        const speaker = SPEAKERS[index % SPEAKERS.length];
        const textChars = MIN_TEXT_CHARS + ((index * 17) % TEXT_SPREAD_CHARS);
        const body = `реплика ${index} ${FILLER.repeat(Math.ceil(textChars / FILLER.length))}`;
        const line = `[${formatTimecode(sec)}] ${speaker}: ${body.trim()}.`;
        lines.push(line);
        chars += line.length + 1;
    }

    return lines;
}

/**
 * Строки частей без перекрытий: повтор в начале части снимается по
 * последней такой же строке предыдущего текста. Строки в тестах уникальны.
 * Перекрытие не по концу предыдущего текста — ошибка.
 */
export function stitchParts(parts: readonly TranscriptPart[]): string[] {
    const result: string[] = [];
    for (const part of parts) {
        const lines = part.text.split('\n');
        const repeatStart = result.lastIndexOf(lines[0]);
        const repeated = repeatStart === -1 ? 0 : result.length - repeatStart;
        if (
            repeated > 0 &&
            lines.slice(0, repeated).join('\n') !==
                result.slice(repeatStart).join('\n')
        ) {
            throw new Error(
                `Часть ${part.number}: перекрытие не совпадает с концом предыдущих`,
            );
        }
        result.push(...lines.slice(repeated));
    }

    return result;
}

/** Строки части. */
export const linesOf = (part: TranscriptPart): string[] =>
    part.text.split('\n');
