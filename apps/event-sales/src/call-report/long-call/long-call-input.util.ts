import {
    LONG_CALL_CONSUMERS,
    type LongCallConsumer,
    type LongCallConsumerInput,
} from './long-call-consumers.const';
import { collectDigestEvents } from './long-call-digest-events.util';
import { buildDigestText } from './long-call-digest-text.util';
import { selectExcerpts } from './long-call-input-excerpts.util';
import { prepareTranscript } from './long-call-input-lines.util';
import {
    locatePartRanges,
    partsWithoutDigest,
} from './long-call-input-parts.util';
import { buildSummaryText } from './long-call-input-summary-text.util';
import {
    buildExcerptsText,
    buildLongCallHeader,
    joinBlocks,
} from './long-call-input-text.util';
import type {
    LongCallConsumerReport,
    LongCallInputs,
} from './long-call-input.types';
import type { ConversationSummary, DigestedPart } from './long-call.types';

/**
 * Тексты для проходов разбора длинного разговора: вместо полной расшифровки
 * каждый потребитель получает шапку, сводку разговора, конспект по частям и
 * дословные отрывки по своей строке таблицы LONG_CALL_CONSUMERS.
 *
 * Чистая функция: без DI, Bitrix и Prisma, без вызовов модели.
 */

const CONSUMERS = Object.keys(LONG_CALL_CONSUMERS) as LongCallConsumer[];

/** Таблица по потребителям: значение каждого получается из значения исходной таблицы. */
function mapConsumers<From, To>(
    source: Record<LongCallConsumer, From>,
    convert: (value: From) => To,
): Record<LongCallConsumer, To> {
    const result = {} as Record<LongCallConsumer, To>;
    for (const consumer of CONSUMERS) {
        result[consumer] = convert(source[consumer]);
    }

    return result;
}

/** Что собрано одному потребителю: текст и сколько отрывков не вошло. */
interface ConsumerBuild {
    text: string;
    droppedExcerpts: number;
}

/**
 * Тексты проходов длинного разговора и сводка для журнала.
 *
 * @param transcript исходная расшифровка целиком (строки «[мм:сс] текст»)
 * @param parts части этой расшифровки (резка с размером LONG_CALL_PART_CHARS)
 *   вместе с конспектами; у части конспекта может не быть (null)
 * @param summary сводка разговора; null — запрос не удался, блока сводки
 *   в текстах не будет
 */
export function buildLongCallInputs(
    transcript: string,
    parts: readonly DigestedPart[],
    summary: ConversationSummary | null,
): LongCallInputs {
    const prepared = prepareTranscript(transcript);
    const events = collectDigestEvents(parts);
    const partRanges = locatePartRanges(prepared, parts);
    const partCandidates = partsWithoutDigest(parts, partRanges);
    const sharedBlocks = [
        buildLongCallHeader(prepared.lastSec),
        summary === null ? null : buildSummaryText(summary),
        buildDigestText(parts),
    ];
    const built = mapConsumers<LongCallConsumerInput, ConsumerBuild>(
        LONG_CALL_CONSUMERS,
        consumer => {
            const selected = selectExcerpts({
                transcript: prepared,
                consumer,
                summary,
                events,
                partCandidates,
                partRanges,
            });

            return {
                text: joinBlocks([
                    ...sharedBlocks,
                    buildExcerptsText(prepared, selected),
                ]),
                droppedExcerpts: selected.dropped,
            };
        },
    );

    return {
        texts: mapConsumers(built, item => item.text),
        report: {
            partsCount: parts.length,
            partsWithoutDigest: parts.filter(({ digest }) => digest === null)
                .length,
            eventsCount: events.length,
            threadsCount: summary?.threads.length ?? 0,
            hasSummary: summary !== null,
            consumers: mapConsumers(
                built,
                (item): LongCallConsumerReport => ({
                    textChars: item.text.length,
                    droppedExcerpts: item.droppedExcerpts,
                }),
            ),
        },
    };
}
