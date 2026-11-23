import { benignBitrixErrorMarker } from '../base/bitrix-benign-error.util';
import { BitrixRateLimitTimeoutError } from '../rate-limit/bitrix-rate-limiter.service';
import {
    formatCommandsLine,
    parseBatchCommand,
    summarizeBatchCommands,
} from './bitrix-batch-commands.util';
import { BitrixFailureReporter } from './bitrix-failure.reporter';
import {
    batchFailureOf,
    commandFailureOf,
    isBitrixFailureReported,
} from './bitrix-failure-record.util';
import { bitrixEntityLabel, bitrixWriteMark } from './bitrix-method.util';
import { failOpen } from './fail-open.util';

/** Итог разбора упавшего чанка для слоя пачки. */
export interface BitrixChunkFailure {
    /** Записана ли строка журнала (иначе её записало ядро или это не сбой). */
    journaled: boolean;
    /** Строка тревоги «Команды (N, запись): …». */
    commandsLine: string;
}

/**
 * Сбои пачки (BatchApiService): упавший чанк и ошибки отдельных команд.
 * Вынесено из сервиса пачки, чтобы он не разрастался; тревоги и журнал —
 * по общим правилам BitrixFailureReporter.
 */
export class BitrixBatchFailureReporter extends BitrixFailureReporter {
    /**
     * Чанк не выполнен — окончательный исход для его команд: вызывающий без
     * strict о нём не узнает. Сбой самого запроса `batch` ядро уже записало
     * (вместе с попытками) — здесь пишется только то, чего оно не видело:
     * например, ответ без result. Отказ ограничителя — не сбой Битрикса.
     *
     * Разбор не удался — строки журнала нет (`journaled: false`, слой пачки
     * пишет лог как раньше), строки команд в тревоге тоже нет.
     */
    chunk(
        text: string,
        batch: [string, string][],
        error: unknown,
    ): BitrixChunkFailure {
        return failOpen<BitrixChunkFailure>(
            () => {
                const commands = batch.map(([key, command]) =>
                    parseBatchCommand(key, command),
                );
                const commandsLine = formatCommandsLine(
                    summarizeBatchCommands(commands),
                );
                if (
                    error instanceof BitrixRateLimitTimeoutError ||
                    isBitrixFailureReported(error)
                ) {
                    return { journaled: false, commandsLine };
                }
                this.journal(
                    'error',
                    text,
                    batchFailureOf(commands, error),
                    error,
                );
                return { journaled: true, commandsLine };
            },
            { journaled: false, commandsLine: '' },
        );
    }

    /**
     * Ошибка одной команды выполненной пачки: строка лога (как раньше,
     * уровень log) и тревога. Ожидаемые ошибки (bitrix-benign-error.util)
     * тревожат как раньше, но в журнал сбоев не пишутся. Разбор команды не
     * удался — строка лога и тревога как раньше, без журнала и подписи.
     */
    command(
        context: string,
        key: string,
        error: unknown,
        cmd: Record<string, string>,
    ): void {
        const message = `[${context}] Ошибка в ${key}: ${JSON.stringify(error)}\n\nDomain: ${this.host.domain}`;
        const logText = `result_error: ${message}`;
        const parsed = failOpen(() => {
            const command = parseBatchCommand(key, cmd[key] ?? '');
            const benign = benignBitrixErrorMarker(
                command.method,
                JSON.stringify(error),
            );
            return {
                record: benign ? undefined : commandFailureOf(command, error),
                line: command.method
                    ? `Команда: ${command.method} ` +
                      `(${bitrixEntityLabel(command.method)}, ${bitrixWriteMark(command.write)})`
                    : '',
            };
        }, undefined);
        if (parsed?.record) {
            this.journal('log', logText, parsed.record);
        } else {
            this.host.logger.log(logText);
        }
        this.alert(message, parsed?.line ? [parsed.line] : []);
    }
}
