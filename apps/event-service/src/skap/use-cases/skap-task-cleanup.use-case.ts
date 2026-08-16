import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import { PBXService } from '@/modules/pbx';

/** Превью одной найденной задачи (проверить глазами перед удалением). */
export interface SkapTaskPreview {
    id: number;
    title: string;
    responsibleId: number | null;
    createdDate: string | null;
}

export interface SkapTaskScanResult {
    domain: string;
    /** Токен операции: передать в confirm (удалить) или discard (забыть). */
    operationId: string;
    /** Сколько всего задач найдено по фильтру. */
    found: number;
    /** Найденные задачи (до 500) — просмотреть заголовки перед решением. */
    preview: SkapTaskPreview[];
}

export interface SkapTaskConfirmResult {
    domain: string;
    operationId: string;
    found: number;
    deleted: number;
    failed: number;
}

/** Страница списка задач Bitrix. */
interface TaskListResponse {
    result?: {
        tasks?: {
            id?: number | string;
            title?: string;
            responsibleId?: number | string;
            createdDate?: string;
        }[];
    };
}

/** Сессия сканирования в Redis (живёт до подтверждения/сброса). */
interface CleanupSession {
    domain: string;
    taskIds: number[];
}

const PAGE_SIZE = 50;
const MAX_PAGES = 100;
const PREVIEW_LIMIT = 500;
const SESSION_TTL_SEC = 60 * 60;
/**
 * Постановщик по умолчанию: bitrix-id пользователя вебхука на gsr
 * (все задачи импорта СКАП созданы от его имени; выбор владельца
 * 12.08.2026). Для другого портала передавать createdBy явно.
 */
const DEFAULT_CREATED_BY = 187;

const sessionKey = (operationId: string): string =>
    `skap:cleanup-tasks:${operationId}`;

/**
 * Двухфазная уборка задач, созданных импортом СКАП (инцидент 12.08.2026:
 * на gsr импорт включили, не зная, что он ставит задачи ответственным).
 *
 * Схема (решение владельца): scan находит задачи по подстроке заголовка
 * («СКАП» — все задачи импорта начинаются с неё; опционально сузить по
 * постановщику CREATED_BY = пользователь вебхука) и складывает список id в
 * Redis под operationId. Человек просматривает заголовки в превью и либо
 * confirm(operationId) — удалить ровно этот зафиксированный список, либо
 * discard(operationId) — забыть. Ничего не удаляется без подтверждения;
 * сессия живёт 1 час.
 */
@Injectable()
export class SkapTaskCleanupUseCase {
    private readonly logger = new Logger(SkapTaskCleanupUseCase.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly redisService: RedisService,
    ) {}

    /** Фаза 1: найти и зафиксировать список под operationId. */
    async scan(
        domain: string,
        options: { titlePrefix?: string; createdBy?: number },
    ): Promise<SkapTaskScanResult> {
        const titlePrefix = options.titlePrefix?.trim() || 'СКАП';
        const createdBy = options.createdBy ?? DEFAULT_CREATED_BY;
        const { bitrix } = await this.pbxService.init(domain);

        const tasks: SkapTaskPreview[] = [];
        for (let page = 0; page < MAX_PAGES; page++) {
            const response = (await bitrix.task.getList(
                {
                    '%TITLE': titlePrefix,
                    CREATED_BY: createdBy,
                } as never,
                ['ID', 'TITLE', 'RESPONSIBLE_ID', 'CREATED_DATE', 'CREATED_BY'],
                { id: 'asc' },
                page * PAGE_SIZE,
            )) as TaskListResponse;
            const pageTasks = response?.result?.tasks ?? [];
            for (const task of pageTasks) {
                const id = Number(task.id);
                if (!id) continue;
                tasks.push({
                    id,
                    title: String(task.title ?? ''),
                    responsibleId: task.responsibleId
                        ? Number(task.responsibleId)
                        : null,
                    createdDate: task.createdDate ?? null,
                });
            }
            if (pageTasks.length < PAGE_SIZE) break;
        }

        const operationId = randomUUID();
        const session: CleanupSession = {
            domain,
            taskIds: tasks.map(task => task.id),
        };
        await this.redisService
            .getClient()
            .set(
                sessionKey(operationId),
                JSON.stringify(session),
                'EX',
                SESSION_TTL_SEC,
            );

        this.logger.log(
            `Скан задач СКАП (${domain}): найдено ${tasks.length} по «${titlePrefix}», ` +
                `постановщик ${createdBy} — операция ${operationId} (TTL 1 час)`,
        );
        return {
            domain,
            operationId,
            found: tasks.length,
            preview: tasks.slice(0, PREVIEW_LIMIT),
        };
    }

    /** Фаза 2а: удалить РОВНО зафиксированный при scan список задач. */
    async confirm(operationId: string): Promise<SkapTaskConfirmResult> {
        const session = await this.takeSession(operationId);
        const { bitrix } = await this.pbxService.init(session.domain);

        const result: SkapTaskConfirmResult = {
            domain: session.domain,
            operationId,
            found: session.taskIds.length,
            deleted: 0,
            failed: 0,
        };
        for (const taskId of session.taskIds) {
            try {
                await bitrix.task.delete(taskId);
                result.deleted++;
            } catch (error) {
                result.failed++;
                this.logger.warn(
                    `Задача #${taskId} не удалена (${session.domain}): ${(error as Error).message}`,
                );
            }
        }
        this.logger.log(
            `Уборка задач СКАП (${session.domain}, операция ${operationId}): ` +
                `удалено ${result.deleted} из ${result.found}, с ошибками ${result.failed}`,
        );
        return result;
    }

    /** Фаза 2б: сброс — забыть найденное, ничего не удаляя. */
    async discard(operationId: string): Promise<{ discarded: boolean }> {
        const removed = await this.redisService
            .getClient()
            .del(sessionKey(operationId));
        return { discarded: removed > 0 };
    }

    /** Сессия по operationId; забирается одноразово (повтор confirm — 404). */
    private async takeSession(operationId: string): Promise<CleanupSession> {
        const redis = this.redisService.getClient();
        const key = sessionKey(operationId);
        const raw = await redis.get(key);
        if (!raw) {
            throw new NotFoundException(
                `Операция ${operationId} не найдена или истекла (TTL 1 час) — повторите scan`,
            );
        }
        await redis.del(key).catch(() => undefined);
        try {
            return JSON.parse(raw) as CleanupSession;
        } catch {
            throw new NotFoundException(
                `Операция ${operationId} повреждена — повторите scan`,
            );
        }
    }
}
