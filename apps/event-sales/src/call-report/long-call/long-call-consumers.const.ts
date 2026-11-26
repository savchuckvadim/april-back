import type { CallFocusKey } from '../contracts/call-focus-sections.contract';
import {
    LONG_CALL_DIRECTIONS,
    LONG_CALL_EVENT_KINDS,
    type LongCallDirection,
    type LongCallEventKind,
} from './long-call.const';

/**
 * Что получает каждый потребитель вместо полной расшифровки длинного
 * разговора: начало и конец дословно, окна вокруг событий нужных видов и
 * отрезки сводки по своему направлению. Таблицу использует сборка текстов
 * для проходов (следующее задание); здесь она только объявлена.
 */

/** Потребитель: четыре фокус-прохода, методика, синтез и «целиком». */
export type LongCallConsumer =
    | CallFocusKey
    | 'methodology'
    | 'synthesis'
    | 'whole';

/** Что оставляем при нехватке бюджета: ранние окна или поздние. */
export type LongCallKeep = 'earliest' | 'latest';

export interface LongCallConsumerInput {
    /** Начало разговора дословно, знаков. */
    headChars: number;
    /** Конец разговора дословно, знаков. */
    tailChars: number;
    /** Окна вокруг событий этих видов. */
    eventKinds: readonly LongCallEventKind[];
    /** Отрезки сводки этих направлений. */
    directions: readonly LongCallDirection[];
    /** Бюджет окон и отрезков, знаков. */
    budgetChars: number;
    /** Что оставляем при нехватке бюджета; null — окон нет. */
    keep: LongCallKeep | null;
}

export const LONG_CALL_CONSUMERS: Record<
    LongCallConsumer,
    LongCallConsumerInput
> = {
    form: {
        headChars: 2_500,
        tailChars: 1_500,
        eventKinds: [],
        directions: ['form'],
        budgetChars: 4_000,
        keep: 'earliest',
    },
    content: {
        headChars: 800,
        tailChars: 0,
        eventKinds: ['need', 'presentation'],
        directions: ['content'],
        budgetChars: 12_000,
        keep: 'earliest',
    },
    movement: {
        headChars: 0,
        tailChars: 0,
        eventKinds: ['objection', 'price', 'competitor', 'issue'],
        directions: ['movement'],
        budgetChars: 12_000,
        keep: 'earliest',
    },
    closing: {
        headChars: 0,
        tailChars: 4_000,
        eventKinds: ['agreement', 'refusal'],
        directions: ['closing'],
        budgetChars: 8_000,
        keep: 'latest',
    },
    methodology: {
        headChars: 2_500,
        tailChars: 4_000,
        eventKinds: ['need', 'presentation', 'agreement'],
        directions: ['methodology'],
        budgetChars: 10_000,
        keep: 'earliest',
    },
    synthesis: {
        headChars: 0,
        tailChars: 0,
        eventKinds: [],
        directions: [],
        budgetChars: 0,
        keep: null,
    },
    whole: {
        headChars: 2_500,
        tailChars: 4_000,
        eventKinds: LONG_CALL_EVENT_KINDS,
        directions: LONG_CALL_DIRECTIONS,
        budgetChars: 16_000,
        keep: 'earliest',
    },
};
