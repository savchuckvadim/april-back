/**
 * Пачка независимых команд одним strict-батчем с контролем полноты.
 */
import {
    assertBatchComplete,
    mergeBatchResults,
} from '../../shared/lib/batch-completeness.util';
import type { ListElementsApi } from './digest-page-loader';

export interface BatchCommand {
    key: string;
    method: string;
    params: Record<string, unknown>;
}

export async function runBatch(
    api: ListElementsApi,
    commands: readonly BatchCommand[],
    context: string,
): Promise<Record<string, unknown>> {
    if (!commands.length) return {};
    for (const command of commands) {
        api.addCmdBatch(command.key, command.method, command.params);
    }
    const merged = mergeBatchResults(
        await api.callBatchWithConcurrency(1, { strict: true }),
    );
    assertBatchComplete(
        merged,
        commands.map(command => command.key),
        context,
    );
    return merged.result;
}

/** Делит массив на куски заданного размера. */
export const chunk = <T>(items: readonly T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size)
        out.push(items.slice(i, i + size));
    return out;
};
