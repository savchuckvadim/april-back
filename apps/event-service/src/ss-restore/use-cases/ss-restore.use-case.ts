import { randomUUID } from 'node:crypto';
import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import { PBXService } from '@/modules/pbx';
import { ORK_HISTORY_LIST } from '@lib/portal-lib/pbx/pbx-ork-history-bx-list';
import {
    SsRestoreApplyResponseDto,
    SsRestoreScanResponseDto,
} from '../dto/ss-restore.dto';
import {
    SsRestoreSession,
    SsRestoreSessionCandidate,
} from '../types/ss-restore.types';
import {
    SsCompanySignalRows,
    SsTaskScanner,
} from '../services/ss-task-scanner.service';
import { SsRestoreWriter } from '../services/ss-restore-writer.service';

const SESSION_TTL_SEC = 60 * 60;
const DEFAULT_FROM = '2026-05-01';

const sessionKey = (operationId: string): string => `ss-restore:${operationId}`;

/**
 * Восстановление потерянных «Сервисный сигнал Состоялся» (потери мая-августа
 * 2026: строгое поле «Компания» + коллизии ELEMENT_CODE в легаси).
 *
 * Двухфазник по образцу skap-cleanup: scan (dry-run) собирает кандидатов —
 * закрытые задачи групп СС без парной «Состоялся»-строки в окне ±2 дня от
 * закрытия — и кладёт их в Redis под operationId (TTL 1 час). apply пишет
 * выбранных (taskIds/limit — «небольшими пачками по согласованию»),
 * применённые вычёркиваются из сессии; failed остаются для повтора.
 */
@Injectable()
export class SsRestoreUseCase {
    private readonly logger = new Logger(SsRestoreUseCase.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly redisService: RedisService,
    ) {}

    async scan(options: {
        domain: string;
        from?: string;
        to?: string;
        groupIds?: number[];
        limit?: number;
    }): Promise<SsRestoreScanResponseDto> {
        const { domain } = options;
        const { bitrix, PortalModel: portal } =
            await this.pbxService.init(domain);
        const list = portal.getListByCode(ORK_HISTORY_LIST.CODE);
        if (!list) {
            throw new BadRequestException(
                `Список ОРК-история не найден на портале ${domain}`,
            );
        }
        const groupIds = options.groupIds?.length
            ? options.groupIds
            : [portal.getServiceSignalTaskGroupId()];
        const from = options.from ?? DEFAULT_FROM;

        const scanner = new SsTaskScanner(bitrix, portal, list);

        let tasks = (
            await Promise.all(
                groupIds.map(groupId =>
                    scanner.loadClosedTasks(groupId, from, options.to),
                ),
            )
        ).flat();
        tasks.sort((a, b) => a.closedDate.localeCompare(b.closedDate));
        if (options.limit) tasks = tasks.slice(0, options.limit);

        const candidates: SsRestoreSessionCandidate[] = [];
        const skipped: { taskId: number; reason: string }[] = [];
        const rowsCache = new Map<number, SsCompanySignalRows>();

        for (const task of tasks) {
            if (!task.companyId) {
                skipped.push({ taskId: task.taskId, reason: 'no_company' });
                continue;
            }
            let rows = rowsCache.get(task.companyId);
            if (!rows) {
                rows = await scanner.loadCompanySignalRows(task.companyId);
                rowsCache.set(task.companyId, rows);
            }
            if (scanner.hasDoneForTask(task, rows)) {
                skipped.push({ taskId: task.taskId, reason: 'already_done' });
                continue;
            }
            const createdRow = scanner.matchCreatedRow(task, rows);
            const comment = await scanner.loadManagerComment(
                task.taskId,
                task.responsibleId,
            );
            candidates.push({
                taskId: task.taskId,
                title: task.title,
                closedDate: task.closedDate,
                elementDate: scanner.elementDate(task),
                responsibleId: task.responsibleId,
                companyId: task.companyId,
                dealId: task.dealId,
                contactId: createdRow?.contactId ?? task.contactId,
                ufCrmTask: task.ufCrmTask,
                comment,
                createdRowId: createdRow?.id ?? null,
            });
        }

        const operationId = randomUUID();
        await this.saveSession(operationId, { domain, candidates });

        this.logger.log(
            `ss-restore scan (${domain}, группы ${groupIds.join(',')}): ` +
                `задач ${tasks.length}, кандидатов ${candidates.length}, ` +
                `пропущено ${skipped.length} — операция ${operationId}`,
        );
        return {
            domain,
            operationId,
            totalTasks: tasks.length,
            candidates,
            skipped,
        };
    }

    async apply(options: {
        operationId: string;
        taskIds?: number[];
        limit?: number;
    }): Promise<SsRestoreApplyResponseDto> {
        const session = await this.readSession(options.operationId);

        let selected = options.taskIds?.length
            ? session.candidates.filter(candidate =>
                  options.taskIds?.includes(candidate.taskId),
              )
            : [...session.candidates];
        if (options.limit) selected = selected.slice(0, options.limit);
        if (!selected.length) {
            throw new BadRequestException(
                'Нет кандидатов для записи (проверьте taskIds/limit или повторите scan)',
            );
        }

        const { bitrix, PortalModel: portal } = await this.pbxService.init(
            session.domain,
        );
        const list = portal.getListByCode(ORK_HISTORY_LIST.CODE);
        if (!list) {
            throw new BadRequestException(
                `Список ОРК-история не найден на портале ${session.domain}`,
            );
        }

        const writer = new SsRestoreWriter(bitrix, list);
        const outcome = await writer.write(selected);

        // применённые и «уже существующие» вычёркиваем; failed остаются
        const done = new Set<number>([
            ...outcome.applied.map(item => item.taskId),
            ...outcome.skippedAlreadyExists,
        ]);
        const remaining = session.candidates.filter(
            candidate => !done.has(candidate.taskId),
        );
        if (remaining.length) {
            await this.saveSession(options.operationId, {
                domain: session.domain,
                candidates: remaining,
            });
        } else {
            await this.redisService
                .getClient()
                .del(sessionKey(options.operationId))
                .catch(() => undefined);
        }

        return {
            domain: session.domain,
            applied: outcome.applied,
            failed: outcome.failed,
            skippedAlreadyExists: outcome.skippedAlreadyExists,
            remaining: remaining.length,
        };
    }

    async discard(operationId: string): Promise<{ discarded: boolean }> {
        const removed = await this.redisService
            .getClient()
            .del(sessionKey(operationId));
        return { discarded: removed > 0 };
    }

    private async saveSession(
        operationId: string,
        session: SsRestoreSession,
    ): Promise<void> {
        await this.redisService
            .getClient()
            .set(
                sessionKey(operationId),
                JSON.stringify(session),
                'EX',
                SESSION_TTL_SEC,
            );
    }

    private async readSession(operationId: string): Promise<SsRestoreSession> {
        const raw = await this.redisService
            .getClient()
            .get(sessionKey(operationId));
        if (!raw) {
            throw new NotFoundException(
                `Операция ${operationId} не найдена или истекла (TTL 1 час) — повторите scan`,
            );
        }
        try {
            return JSON.parse(raw) as SsRestoreSession;
        } catch {
            throw new NotFoundException(
                `Операция ${operationId} повреждена — повторите scan`,
            );
        }
    }
}
