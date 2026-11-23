import { requestedEntityId } from '../base/bitrix-benign-error.util';
import {
    BitrixBatchCommand,
    summarizeBatchCommands,
} from './bitrix-batch-commands.util';
import {
    BITRIX_FAILURE_KIND,
    BitrixFailure,
    BitrixFailureCommands,
} from './bitrix-failure.types';
import { bitrixEntityLabel, isBitrixWriteMethod } from './bitrix-method.util';

/** Запись о сбое без портала: портал подставляет BitrixFailureReporter. */
export type BitrixFailureDraft = Omit<BitrixFailure, 'domain'>;

/** Предел текста ошибки в журнале: meta строки лога ограничена 8 КБ. */
const ERROR_TEXT_MAX = 500;

const cut = (text: string): string =>
    text.length > ERROR_TEXT_MAX
        ? `${text.slice(0, ERROR_TEXT_MAX - 1)}…`
        : text;

const httpStatusOf = (error: unknown): number | undefined => {
    const status = (error as { response?: { status?: unknown } } | null)
        ?.response?.status;
    return typeof status === 'number' ? status : undefined;
};

/**
 * Суть сбоя вызова — для тревоги пачки и журнала.
 *
 * Объект ошибки axios целиком НЕ берём: его сериализация содержит адрес
 * запроса вместе с ключом вебхука портала и тело запроса с данными
 * клиентов. Берём только то, что помогает разобраться.
 */
export function describeBitrixError(error: unknown): string {
    const e = error as {
        message?: unknown;
        code?: unknown;
        response?: { status?: unknown; data?: unknown };
    } | null;
    const parts: string[] = [];
    if (typeof e?.message === 'string') parts.push(e.message);
    if (typeof e?.code === 'string') parts.push(`код ${e.code}`);
    if (typeof e?.response?.status === 'number') {
        parts.push(`HTTP ${e.response.status}`);
    }
    const body = e?.response?.data as
        | { error?: unknown; error_description?: unknown }
        | undefined;
    if (typeof body?.error === 'string') parts.push(body.error);
    if (typeof body?.error_description === 'string') {
        parts.push(body.error_description);
    }
    return parts.length ? parts.join(' · ') : 'неизвестная ошибка';
}

/** Ошибка команды из `result_error` пачки: код и описание Битрикса. */
export function describeBitrixCommandError(error: unknown): string {
    if (typeof error === 'string') return cut(error);
    const e = error as { error?: unknown; error_description?: unknown } | null;
    const parts = [e?.error, e?.error_description].filter(
        (part): part is string => typeof part === 'string' && part !== '',
    );
    return cut(
        parts.length ? parts.join(' · ') : JSON.stringify(error ?? null),
    );
}

/**
 * Окончательный сбой вызова: одиночного (`call`) или всей пачки, если метод
 * — `batch` и известна её сводка (`commands`).
 */
export function callFailureOf(
    method: string,
    data: unknown,
    error: unknown,
    commands?: BitrixFailureCommands,
): BitrixFailureDraft {
    const status = httpStatusOf(error);
    const base = {
        method,
        error: cut(describeBitrixError(error)),
        ...(status === undefined ? {} : { status }),
    };
    if (commands) {
        return {
            ...base,
            kind: BITRIX_FAILURE_KIND.batch,
            write: commands.writes > 0,
            commands,
        };
    }
    const id = requestedEntityId(data);
    return {
        ...base,
        kind: BITRIX_FAILURE_KIND.call,
        write: isBitrixWriteMethod(method),
        ...(id === '—'
            ? {}
            : { entity: { label: bitrixEntityLabel(method), id } }),
    };
}

/** Упавший чанк пачки, если сам вызов его не записал (не сбой запроса). */
export function batchFailureOf(
    commands: BitrixBatchCommand[],
    error: unknown,
): BitrixFailureDraft {
    return callFailureOf(
        'batch',
        undefined,
        error,
        summarizeBatchCommands(commands),
    );
}

/** Ошибка одной команды внутри выполненной пачки. */
export function commandFailureOf(
    command: BitrixBatchCommand,
    error: unknown,
): BitrixFailureDraft {
    return {
        kind: BITRIX_FAILURE_KIND.command,
        method: command.method,
        write: command.write,
        ...(command.entityId
            ? {
                  entity: {
                      label: bitrixEntityLabel(command.method),
                      id: command.entityId,
                  },
              }
            : {}),
        commands: summarizeBatchCommands([command]),
        error: describeBitrixCommandError(error),
    };
}

/**
 * Ошибки, о которых журнал уже знает (или которые записывать не нужно —
 * ожидаемые, см. bitrix-benign-error.util). Ядро вызова записывает сбой
 * запроса `batch` само; слой пачки потом видит ту же ошибку и второй раз
 * её не пишет.
 */
const reported = new WeakSet<object>();

export const markBitrixFailureReported = (error: unknown): void => {
    if (typeof error === 'object' && error !== null) reported.add(error);
};

export const isBitrixFailureReported = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && reported.has(error);
