import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import {
    FrameProxyBaseDto,
    FrameProxyBatchDto,
    FrameProxyBatchResponseDto,
    FrameProxyCallDto,
    FrameProxyCallResponseDto,
} from './dto/frame-proxy.dto';
import {
    BITRIX_BATCH_SIZE,
    chunksOf,
    commandsOf,
    emptyBatchResult,
    mergeBatchAnswer,
} from './lib/frame-batch-answer';
import { toBatchCommand } from './lib/frame-batch-command';
import { isFrameMethodAllowed } from './lib/frame-method-policy';
import { toFrameProxyError } from './lib/frame-proxy-error';

/**
 * «ЗВОНКИ» РАБОТАЮТ ЧЕРЕЗ СЕРВЕР, КОГДА У СОТРУДНИКА НЕ ХВАТАЕТ ПРАВ.
 *
 * Решение владельца 22–25.10.2026: приложение выполняет свои функции
 * независимо от прав сотрудника на портале — права там бывают настроены
 * криво. Фронт, получив от Битрикса «нет доступа», переключается и шлёт
 * все запросы сюда; сервер выполняет их вебхуком портала.
 *
 * Границы: только методы приложения (frame-method-policy), только своя
 * сессия (portal-context токен проверяется всегда), каждый вызов — в
 * журнал: домен, пользователь, метод.
 *
 * Инстанс Битрикса не хранится в this — свежий на каждый вызов из
 * PBXService (правило проекта про race condition между доменами).
 */
@Injectable()
export class FrameProxyService {
    private readonly logger = new Logger(FrameProxyService.name);

    constructor(private readonly pbxService: PBXService) {}

    async call(dto: FrameProxyCallDto): Promise<FrameProxyCallResponseDto> {
        this.assertAllowed([dto.method]);
        this.journal(dto, dto.method);
        const { bitrix } = await this.pbxService.init(dto.domain);
        try {
            const answer = await bitrix.api.call(dto.method, dto.params ?? {});
            return { ok: true, answer: answer as Record<string, unknown> };
        } catch (failure) {
            const error = toFrameProxyError(failure);
            this.logger.warn(
                `[frame-proxy] ${dto.domain} u${dto.requesterUserId} ` +
                    `${dto.method}: ${error.error} ${error.errorDescription}`,
            );
            return { ok: false, ...error };
        }
    }

    async batch(dto: FrameProxyBatchDto): Promise<FrameProxyBatchResponseDto> {
        const commands = commandsOf(dto.commands);
        const methods = commands.map(([, command]) => command.method);
        this.assertAllowed(methods);
        this.journal(
            dto,
            `batch(${commands.length}): ${[...new Set(methods)].join(', ')}`,
        );

        const { bitrix } = await this.pbxService.init(dto.domain);
        const merged = emptyBatchResult();
        for (const chunk of chunksOf(commands, BITRIX_BATCH_SIZE)) {
            const cmd = Object.fromEntries(
                chunk.map(([key, command]) => [
                    key,
                    toBatchCommand(command.method, command.params),
                ]),
            );
            try {
                const answer = await bitrix.api.call('batch', { halt: 0, cmd });
                mergeBatchAnswer(merged, answer);
            } catch (failure) {
                // Пакет не дошёл целиком — каждая его команда с этой ошибкой,
                // как в result_error Битрикса.
                const error = toFrameProxyError(failure);
                for (const [key] of chunk) {
                    merged.errors[key] = {
                        error: error.error,
                        error_description: error.errorDescription,
                    };
                }
            }
        }
        return merged;
    }

    private assertAllowed(methods: readonly string[]): void {
        const denied = methods.filter(method => !isFrameMethodAllowed(method));
        if (denied.length) {
            throw new ForbiddenException(
                `Через сервер нельзя: ${[...new Set(denied)].join(', ')}`,
            );
        }
    }

    /** Журнал: кто, на каком портале, что выполнил от имени портала. */
    private journal(dto: FrameProxyBaseDto, what: string): void {
        this.logger.log(
            `[frame-proxy] ${dto.domain} u${dto.requesterUserId} ${what}`,
        );
    }
}
