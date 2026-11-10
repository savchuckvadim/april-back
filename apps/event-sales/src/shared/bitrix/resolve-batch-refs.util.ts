import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { findBatchResult } from './prepare-batch-results.util';

/** Ссылка на ответ соседней команды пачки: `$result[cmd]` и путь `[a][b]`. */
const BATCH_REF = /\$result\[([^\]]+)\]((?:\[[^\]]+\])*)/g;

/** В строке есть ссылка `$result[...]` на ответ другой команды пачки. */
export const hasBatchRef = (text: string): boolean =>
    /\$result\[[^\]]+\]/.test(text);

const scalarOf = (raw: unknown): string | null => {
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
    if (typeof raw === 'string' && raw !== '') return raw;
    return null;
};

const navigate = (root: unknown, path: string): unknown =>
    [...path.matchAll(/\[([^\]]+)\]/g)]
        .map(match => match[1])
        .reduce<unknown>(
            (node, key) =>
                node !== null && typeof node === 'object'
                    ? (node as Record<string, unknown>)[key]
                    : undefined,
            root,
        );

/**
 * Подставляет в значения ответы УЖЕ выполненной пачки — для команд, которые
 * уходят второй волной и сослаться на `$result[...]` первой не могут.
 *
 * Зачем вторая волна: Битрикс подставляет ссылку, только если она стоит в
 * КОНЦЕ значения, а всё после неё отбрасывает. Код уникальной записи KPI
 * `410377_$result[set_base_deal]_done` уехал как `410377_278763`, и все
 * уникальные записи отчёта слились в один код (gsirk 10.11.2026).
 *
 * @returns копия значения с подставленными id; null — хоть одна ссылка не
 *   нашлась в ответе (команда упала), и записывать такое значение нельзя.
 */
export function resolveBatchRefs<T>(
    value: T,
    results: IBitrixBatchResponseResult[],
): T | null {
    let unresolved = false;
    const walk = (node: unknown): unknown => {
        if (typeof node === 'string') {
            return node.replace(
                BATCH_REF,
                (whole, cmd: string, path: string) => {
                    const resolved = scalarOf(
                        navigate(findBatchResult(results, cmd), path),
                    );
                    if (resolved === null) unresolved = true;
                    return resolved ?? whole;
                },
            );
        }
        if (Array.isArray(node)) return node.map(walk);
        if (node !== null && typeof node === 'object') {
            return Object.fromEntries(
                Object.entries(node).map(([key, item]) => [key, walk(item)]),
            );
        }
        return node;
    };
    const resolved = walk(value) as T;
    return unresolved ? null : resolved;
}
