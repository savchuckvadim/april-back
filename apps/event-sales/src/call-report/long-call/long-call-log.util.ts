import type { LongCallConsumer } from './long-call-consumers.const';
import type { LongCallInputReport } from './long-call-input.types';

/**
 * Одна строка журнала на подготовленный длинный разговор: что получилось и
 * сколько это стоило. Чистая функция — формат проверяется тестом.
 */

export interface LongCallLogFacts {
    domain: string;
    /** Знаков в расшифровке. */
    transcriptChars: number;
    report: LongCallInputReport;
    /** Запросов к модели ушло (с повторами и сорвавшимися). */
    requests: number;
    /** Ответов взято из кэша. */
    cacheHits: number;
    /** Время подготовки, секунд (уже с нужным числом знаков). */
    seconds: string;
}

/** «form 4200, content 3100, …» — длина текста по потребителям. */
function consumerLengths(report: LongCallInputReport): string {
    return (Object.keys(report.consumers) as LongCallConsumer[])
        .map(consumer => `${consumer} ${report.consumers[consumer].textChars}`)
        .join(', ');
}

/** Строка журнала по разговору. */
export function formatLongCallLog(facts: LongCallLogFacts): string {
    const { report } = facts;

    return (
        `Длинный разговор (${facts.domain}): расшифровка ${facts.transcriptChars} зн., ` +
        `частей ${report.partsCount}, без конспекта ${report.partsWithoutDigest}, ` +
        `событий ${report.eventsCount}, линий ${report.threadsCount}, ` +
        `сводка ${report.hasSummary ? 'есть' : 'нет'}; ` +
        `тексты: ${consumerLengths(report)}; ` +
        `запросов ${facts.requests}, из кэша ${facts.cacheHits}; ${facts.seconds} с`
    );
}
