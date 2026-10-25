import { BadRequestException } from '@nestjs/common';
import { FRAME_PROXY_METHOD_PATTERN } from './frame-method-policy';
import type { FrameProxyCommand } from '../dto/frame-proxy.dto';

/** Пакет фрейма за один запрос: больше — признак ошибки фронта. */
export const FRAME_PROXY_MAX_COMMANDS = 500;

/** Сколько команд в одном batch Битрикса. */
export const BITRIX_BATCH_SIZE = 50;

/** Результат пакета по ключам команд — форма ответа ручки. */
export interface FrameBatchResult {
    result: Record<string, unknown>;
    errors: Record<string, unknown>;
    total: Record<string, unknown>;
    next: Record<string, unknown>;
}

export const emptyBatchResult = (): FrameBatchResult => ({
    result: {},
    errors: {},
    total: {},
    next: {},
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

/** Пустой результат Битрикс отдаёт массивом `[]` — приводим к объекту. */
const keyed = (value: unknown): Record<string, unknown> => {
    if (isRecord(value)) return value;
    if (Array.isArray(value)) {
        return Object.fromEntries(value.map((item, i) => [String(i), item]));
    }
    return {};
};

/** Ответ `batch` Битрикса дописывается в общий результат пакета. */
export function mergeBatchAnswer(
    target: FrameBatchResult,
    answer: unknown,
): void {
    const inner = isRecord(answer) ? answer.result : undefined;
    if (!isRecord(inner)) return;
    Object.assign(target.result, keyed(inner.result));
    Object.assign(target.errors, keyed(inner.result_error));
    Object.assign(target.total, keyed(inner.result_total));
    Object.assign(target.next, keyed(inner.result_next));
}

/** Команды пакета из тела запроса — с проверкой формы. */
export function commandsOf(
    raw: Record<string, unknown>,
): Array<[string, FrameProxyCommand]> {
    const entries = Object.entries(raw);
    if (!entries.length) {
        throw new BadRequestException('Пакет пустой');
    }
    if (entries.length > FRAME_PROXY_MAX_COMMANDS) {
        throw new BadRequestException(
            `В пакете больше ${FRAME_PROXY_MAX_COMMANDS} команд`,
        );
    }
    return entries.map(([key, value]) => {
        const method = isRecord(value) ? value.method : undefined;
        const params = isRecord(value) ? value.params : undefined;
        if (
            typeof method !== 'string' ||
            !FRAME_PROXY_METHOD_PATTERN.test(method.toLowerCase()) ||
            (params !== undefined && !isRecord(params))
        ) {
            throw new BadRequestException(
                `Команда «${key}»: нужен { method, params? }`,
            );
        }
        return [key, { method, params }];
    });
}

/** Части по размеру batch Битрикса. */
export function chunksOf<T>(items: readonly T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}
