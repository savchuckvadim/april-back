import { formatTimecode } from '@lib/call-lib';
import {
    LONG_CALL_EVENT_KIND_LABELS,
    LONG_CALL_THREAD_STATUS_LABELS,
} from './long-call.const';
import {
    LONG_CALL_ABRUPT_LINE,
    LONG_CALL_LINE_SEPARATOR,
    LONG_CALL_RESULT_PREFIX,
    LONG_CALL_SUMMARY_TITLE,
    LONG_CALL_THREADS_TITLE,
} from './long-call-input.const';
import type { ConversationSummary, SummaryThread } from './long-call.types';

/**
 * Печать сводки разговора — одинаковый блок у всех потребителей.
 *
 * Чистая функция: без DI, Bitrix и Prisma.
 */

const MOMENT_SEPARATOR = ', ';

/** «- возражение, «тема» — закрыто (12:05, 31:40): пояснение». */
function threadLine(thread: SummaryThread): string {
    const moments =
        thread.moments.length > 0
            ? ` (${thread.moments.map(formatTimecode).join(MOMENT_SEPARATOR)})`
            : '';
    const note = thread.note ? `: ${thread.note}` : '';
    const kind = LONG_CALL_EVENT_KIND_LABELS[thread.kind];
    const status = LONG_CALL_THREAD_STATUS_LABELS[thread.status];

    return `- ${kind}, «${thread.topic}» — ${status}${moments}${note}`;
}

/**
 * Блок «СВОДКА РАЗГОВОРА»: ход разговора, сквозные линии, чем кончился
 * разговор и, если запись оборвалась, строка про обрыв.
 */
export function buildSummaryText(summary: ConversationSummary): string {
    const lines: string[] = [LONG_CALL_SUMMARY_TITLE, summary.story];
    if (summary.threads.length > 0) {
        lines.push(LONG_CALL_THREADS_TITLE, ...summary.threads.map(threadLine));
    }
    if (summary.result) {
        lines.push(`${LONG_CALL_RESULT_PREFIX}${summary.result}`);
    }
    if (summary.endedAbruptly) lines.push(LONG_CALL_ABRUPT_LINE);

    return lines.join(LONG_CALL_LINE_SEPARATOR);
}
