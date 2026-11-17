import {
    CLIENT_CALL_ANALYSIS_GRACE_MS,
    type ClientCallState,
} from './client-calls.const';

/** Что известно о звонке в конвейере на момент запроса списка. */
export interface ClientCallStateInput {
    /** Статус строки расшифровки; undefined — строки нет. */
    status: string | null | undefined;
    /** У звонка есть действующий разбор. */
    hasAnalysis: boolean;
    /** Когда строка расшифровки менялась последний раз. */
    updatedAt: Date | null;
    now: Date;
}

/**
 * Состояние разбора звонка. Готовый разбор важнее статуса строки: при
 * повторном разборе строка снова уходит в работу, а прежний разбор читать
 * уже можно.
 */
export function clientCallStateOf(
    input: ClientCallStateInput,
): ClientCallState {
    if (input.hasAnalysis) return 'analyzed';
    switch (input.status) {
        case 'queued':
        case 'processing':
            return 'processing';
        case 'error':
            return 'failed';
        case 'done':
            return isFresh(input.updatedAt, input.now)
                ? 'processing'
                : 'skipped';
        default:
            return 'none';
    }
}

/** Расшифровка готова недавно — разбор ещё может идти. */
function isFresh(updatedAt: Date | null, now: Date): boolean {
    if (updatedAt === null) return false;
    return now.getTime() - updatedAt.getTime() < CLIENT_CALL_ANALYSIS_GRACE_MS;
}
