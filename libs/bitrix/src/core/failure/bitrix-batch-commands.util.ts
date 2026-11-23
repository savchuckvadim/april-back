import type { BitrixFailureCommands } from './bitrix-failure.types';
import {
    bitrixEntityLabel,
    bitrixWriteMark,
    isBitrixWriteMethod,
} from './bitrix-method.util';

/**
 * Разбор пачки (batch) для тревоги и журнала: что в ней было — сводкой,
 * без значений полей (в командах — данные клиентов).
 */

/** Одна команда пачки: `cmd[key] = 'crm.deal.update?id=1&fields[…]=…'`. */
export interface BitrixBatchCommand {
    key: string;
    method: string;
    write: boolean;
    /** id из параметров команды (`id`/`ID`), если есть. */
    entityId?: string;
}

const SUMMARY_KEYS_MAX = 5;
const KEY_MAX_LENGTH = 40;
const SUMMARY_GROUPS_MAX = 6;

const cut = (text: string, max: number): string =>
    text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** id сущности из строки параметров команды. */
const queryEntityId = (query: string): string | undefined => {
    const params = new URLSearchParams(query);
    const id = (params.get('id') ?? params.get('ID') ?? '').trim();
    return id || undefined;
};

export function parseBatchCommand(
    key: string,
    command: string,
): BitrixBatchCommand {
    const separator = command.indexOf('?');
    const method = (
        separator === -1 ? command : command.slice(0, separator)
    ).trim();
    const entityId =
        separator === -1
            ? undefined
            : queryEntityId(command.slice(separator + 1));
    return {
        key,
        method,
        write: isBitrixWriteMethod(method),
        ...(entityId ? { entityId } : {}),
    };
}

/** Команды из тела вызова `batch` (`{ halt, cmd }`); не пачка — пусто. */
export function batchCommandsOf(data: unknown): BitrixBatchCommand[] {
    if (typeof data !== 'object' || data === null) return [];
    const cmd = (data as { cmd?: unknown }).cmd;
    if (typeof cmd !== 'object' || cmd === null) return [];
    return Object.entries(cmd as Record<string, unknown>)
        .filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
        )
        .map(([key, command]) => parseBatchCommand(key, command));
}

/** «сделка ×3, задача ×1, строка списка ×2» — чаще встречающиеся первыми. */
const groupSummary = (commands: BitrixBatchCommand[]): string => {
    const counts = new Map<string, number>();
    for (const command of commands) {
        const label = bitrixEntityLabel(command.method);
        counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    // sort стабилен: при равенстве — порядок первого появления в пачке.
    const groups = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const shown = groups
        .slice(0, SUMMARY_GROUPS_MAX)
        .map(([label, count]) => `${label} ×${count}`);
    if (groups.length > SUMMARY_GROUPS_MAX) shown.push('…');
    return shown.join(', ');
};

export function summarizeBatchCommands(
    commands: BitrixBatchCommand[],
): BitrixFailureCommands {
    return {
        total: commands.length,
        writes: commands.filter(command => command.write).length,
        summary: groupSummary(commands),
        keys: commands
            .slice(0, SUMMARY_KEYS_MAX)
            .map(command => cut(command.key, KEY_MAX_LENGTH)),
    };
}

/** «запись», «чтение» или «запись 4, чтение 2». */
const commandsMark = ({ total, writes }: BitrixFailureCommands): string => {
    if (writes === total || writes === 0) return bitrixWriteMark(writes > 0);
    return `запись ${writes}, чтение ${total - writes}`;
};

/**
 * Строка тревоги: `Команды (6, запись): сделка ×3, задача ×1 · ключи: a, b …ещё 1`.
 */
export function formatCommandsLine(commands: BitrixFailureCommands): string {
    const rest = commands.total - commands.keys.length;
    const keys = commands.keys.length
        ? ` · ключи: ${commands.keys.join(', ')}${rest > 0 ? ` …ещё ${rest}` : ''}`
        : '';
    return (
        `Команды (${commands.total}, ${commandsMark(commands)}): ` +
        `${commands.summary || '—'}${keys}`
    );
}
