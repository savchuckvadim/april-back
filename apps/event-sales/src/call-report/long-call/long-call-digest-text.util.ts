import { formatTimecode } from '@lib/call-lib';
import {
    LONG_CALL_DIGEST_TITLE,
    LONG_CALL_DIGEST_UNKNOWN_ENDING,
    LONG_CALL_EVENT_KIND_LABELS,
} from './long-call.const';
import type {
    DigestedPart,
    PartDigestEvent,
    TranscriptPart,
} from './long-call.types';
import { dedupeEventsByPart } from './long-call-digest-events.util';

/**
 * Печать конспекта по частям — текст, который видят модель сводки и
 * проходы разбора вместо полной расшифровки.
 *
 * Чистая функция: без DI, Bitrix и Prisma.
 */

const EVENT_INDENT = '  ';

/** «Часть 2 (08:50–18:10)»; у записи без меток времени — «Часть 2». */
function partHeading(part: TranscriptPart): string {
    if (part.fromSec === null || part.toSec === null) {
        return `Часть ${part.number}`;
    }

    return `Часть ${part.number} (${formatTimecode(part.fromSec)}–${formatTimecode(part.toSec)})`;
}

/** «  [02:15] потребность: «цитата» — пояснение»; без времени — без метки. */
function eventLine(event: PartDigestEvent): string {
    const time =
        event.startSec === null ? '' : `[${formatTimecode(event.startSec)}] `;
    const note = event.note ? ` — ${event.note}` : '';

    return `${EVENT_INDENT}${time}${LONG_CALL_EVENT_KIND_LABELS[event.kind]}: «${event.quote}»${note}`;
}

/** Конец записи по последней части с конспектом, без точки на конце. */
function endingOf(parts: readonly DigestedPart[]): string {
    const digested = parts.filter(item => item.digest !== null);
    const last = digested[digested.length - 1]?.digest;
    const ending = last?.endsWith.replace(/[.\s]+$/, '') ?? '';

    return ending || LONG_CALL_DIGEST_UNKNOWN_ENDING;
}

/**
 * Конспект по частям одним текстом. События из перекрытий не дублируются;
 * часть без конспекта — строка «конспекта нет».
 */
export function buildDigestText(parts: readonly DigestedPart[]): string {
    const eventsByPart = dedupeEventsByPart(parts);
    const lines: string[] = [LONG_CALL_DIGEST_TITLE];
    parts.forEach(({ part, digest }, index) => {
        if (digest === null) {
            lines.push(`${partHeading(part)}: конспекта нет.`);

            return;
        }
        lines.push(`${partHeading(part)}. ${digest.summary}`);
        lines.push(...eventsByPart[index].map(eventLine));
    });
    const questions = parts.reduce(
        (sum, { digest }) => sum + (digest?.managerQuestions ?? 0),
        0,
    );
    lines.push(
        `Вопросов менеджера всего: ${questions}. Конец записи: ${endingOf(parts)}.`,
    );

    return lines.join('\n');
}
