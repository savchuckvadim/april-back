import type { Logger } from '@nestjs/common';
import type { TelegramService } from '@lib/telegram/telegram.service';
import { getProcessAppName } from '@/core/call-context/process-app-name';
import { getBitrixCallContext } from '../context/bitrix-call-context';
import {
    callContextSnapshot,
    describeCallPlace,
    signBitrixAlert,
} from './bitrix-call-place.util';
import type { BitrixFailureLogMeta } from './bitrix-failure.types';
import {
    BitrixFailureDraft,
    callFailureOf,
    markBitrixFailureReported,
} from './bitrix-failure-record.util';
import {
    batchCommandsOf,
    formatCommandsLine,
    summarizeBatchCommands,
} from './bitrix-batch-commands.util';
import { failOpen } from './fail-open.util';

/** Что нужно отчёту о сбое от экземпляра Битрикса (BitrixCore). */
export interface BitrixFailureHost {
    readonly domain: string;
    readonly logger: Pick<Logger, 'error' | 'log'>;
    readonly telegramBot: Pick<TelegramService, 'sendMessageAdminError'>;
}

/** Уровень строки журнала: сбой вызова — error, ошибка команды пачки — как раньше, log. */
export type BitrixFailureLogLevel = 'error' | 'log';

/** Неудачная попытка вызова (BitrixCore.reportError). */
export interface BitrixCallFailureInput {
    method: string;
    data: unknown;
    error: unknown;
    /** Повтора не будет: попытки исчерпаны или ошибка не лечится повтором. */
    final: boolean;
    /** Строка лога — как раньше. */
    logText: string;
    /** Первая строка тревоги — как раньше. */
    alertText: string;
}

/**
 * Подпись тревог Битрикса и запись окончательных сбоев в журнал.
 *
 * Не `@Injectable`: создаётся на экземпляр Битрикса и знает только его
 * портал. Откуда шёл запрос, берётся из контекста вызова в момент сбоя
 * (`@lib/core/call-context`), а не хранится здесь.
 *
 * Политика тревог (10.11.2026) не меняется: тревога — на каждую попытку,
 * здесь к ней лишь дописываются строки «Где: …» и «Команды (N): …».
 * В журнал (ClickHouse, meta.bitrixFailure) — только окончательные исходы.
 */
export class BitrixFailureReporter {
    constructor(protected readonly host: BitrixFailureHost) {}

    /**
     * Текст тревоги со второй строкой «Где: …» и дополнительными строками.
     * Подпись не собралась — тревога уходит как раньше, без подписи.
     */
    sign(text: string, extraLines: string[] = []): string {
        return failOpen(
            () =>
                signBitrixAlert(
                    text,
                    describeCallPlace(
                        getBitrixCallContext(),
                        getProcessAppName(),
                    ),
                    extraLines,
                ),
            text,
        );
    }

    /**
     * Тревога в Telegram без ожидания ответа: у клиента телеграма нет
     * таймаута, и сбой не должен ждать ещё и его.
     */
    alert(text: string, extraLines: string[] = []): void {
        const signed = this.sign(text, extraLines);
        failOpen(() => {
            void Promise.resolve(
                this.host.telegramBot.sendMessageAdminError(signed),
            ).catch(() => undefined);
        }, undefined);
    }

    /** meta строки журнала: сбой, откуда шёл запрос и портал. */
    meta(failure: BitrixFailureDraft): BitrixFailureLogMeta {
        const domain = this.host.domain;
        return {
            bitrixFailure: { ...failure, domain },
            callContext: callContextSnapshot(
                getBitrixCallContext(),
                getProcessAppName(),
            ),
            domain,
        };
    }

    /**
     * Строка журнала об окончательном сбое. Ошибка помечается записанной —
     * слой выше (пачка) второй раз её не запишет. meta не собралась —
     * строка лога пишется как раньше, без записи журнала.
     */
    journal(
        level: BitrixFailureLogLevel,
        message: string,
        failure: BitrixFailureDraft,
        error?: unknown,
    ): void {
        const meta = failOpen<BitrixFailureLogMeta | undefined>(
            () => this.meta(failure),
            undefined,
        );
        if (!meta) {
            this.host.logger[level](message);
            return;
        }
        if (error !== undefined) markBitrixFailureReported(error);
        this.host.logger[level](message, meta);
    }

    /**
     * Неудачная попытка вызова: строка лога (у окончательного исхода — с
     * записью журнала) и подписанная тревога; у пачки (`batch`) — со
     * сводкой команд. Сбой разбора не меняет ни строку лога, ни тревогу.
     */
    callFailed(input: BitrixCallFailureInput): void {
        const { method, data, error } = input;
        const commands =
            method === 'batch'
                ? failOpen(
                      () => summarizeBatchCommands(batchCommandsOf(data)),
                      undefined,
                  )
                : undefined;
        const failure = input.final
            ? failOpen(
                  () => callFailureOf(method, data, error, commands),
                  undefined,
              )
            : undefined;
        if (failure) {
            this.journal('error', input.logText, failure, error);
        } else {
            this.host.logger.error(input.logText);
        }
        const commandsLine = commands
            ? failOpen(() => formatCommandsLine(commands), '')
            : '';
        this.alert(input.alertText, commandsLine ? [commandsLine] : []);
    }
}
