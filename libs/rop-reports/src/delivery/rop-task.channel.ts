import { BitrixService } from '@lib/bitrix';
import { EBXTaskStatus } from '@lib/bitrix/domain/tasks/task/interface/task.interface';
import { BitrixDateTime } from '@lib/shared/lib/date';
import { getErrorString } from '@lib/shared/lib/utils/get-error-string.util';
import { toId } from '../recipients/department-heads.util';
import { RopReportKeys } from '../state/rop-keys';
import { RopDiskUploader } from './rop-disk.uploader';
import {
    RopChannelOutcome,
    RopDeliveryChannel,
    RopDeliveryOptions,
    RopRenderedReport,
    RopTaskMemo,
    RopTaskMemoryPort,
} from './rop-delivery.types';

/** Задача уже закрыта — закрывать нечего. */
const CLOSED_STATUSES: readonly string[] = [
    EBXTaskStatus.COMPLETED,
    EBXTaskStatus.DECLINED,
];

/** Статус задачи из ответа `tasks.task.get` строкой ('5'); нет — ''. */
const statusOf = (raw: unknown): string =>
    typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';

/**
 * Отчёт РОПу задачей: файл на Диск → задача с файлом
 * (`UF_TASK_WEBDAV_FILES: ['n' + id]` в `tasks.task.add`) → прошлая
 * задача того же вида другого периода закрывается. Обобщение доставки
 * отчёта по дублям.
 *
 * Идемпотентность: память знает, за какой период поставлена последняя
 * задача получателя. Повтор того же периода вторую задачу не ставит.
 * К CRM задача не привязывается: в карточках она сбила бы менеджеров и
 * счётчик открытых задач аудита сделок.
 *
 * НЕ `@Injectable`: инстанс Битрикса — параметр (CLAUDE.md). Любой сбой —
 * предупреждение, а не исключение: отчёт одному получателю не должен
 * мешать остальным.
 */
export class RopTaskChannel implements RopDeliveryChannel {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly disk: RopDiskUploader,
        private readonly memory: RopTaskMemoryPort,
        private readonly keys: RopReportKeys,
        /** Сколько помнить задачу получателя (`ROP_TASK_TTL_SEC` вида). */
        private readonly memoryTtlSec: number,
    ) {}

    async deliver(
        userId: number,
        report: RopRenderedReport,
        options: RopDeliveryOptions,
        warnings: string[],
    ): Promise<RopChannelOutcome> {
        const { domain, kind, periodKey } = options.scope;
        const taskKey = this.keys.task(domain, kind, userId);
        const previous = await this.memory.previous(taskKey).catch(() => null);
        if (previous?.periodKey === periodKey) {
            return {
                taskId: previous.taskId,
                alreadyDone: true,
                closedPrevious: false,
            };
        }
        const fileId = report.file
            ? await this.disk.upload(report.file, options.ownerId, warnings)
            : null;
        const taskId = await this.createTask(
            userId,
            report,
            options,
            fileId,
            warnings,
        );
        if (!taskId) {
            return { taskId: null, alreadyDone: false, closedPrevious: false };
        }
        const closedPrevious =
            previous && previous.taskId !== taskId
                ? await this.closeTask(previous.taskId, warnings)
                : false;
        await this.memory
            .remember(
                taskKey,
                this.keys.recipients(domain, kind),
                userId,
                { periodKey, taskId },
                this.memoryTtlSec,
            )
            .catch((error: unknown) =>
                warnings.push(
                    `задача-отчёт ${taskId} не запомнена — следующий выпуск её не закроет: ${getErrorString(error)}`,
                ),
            );
        return { taskId, alreadyDone: false, closedPrevious };
    }

    /**
     * Закрыть прошлые задачи-отчёты тех, кому отчёта в этот раз нет:
     * получателя убрали из настроек или он больше не руководитель. Задачи
     * за текущий период не трогаются — это свежий отчёт этого же выпуска.
     *
     * @returns сколько задач закрыто.
     */
    async closeStale(
        currentUserIds: readonly number[],
        options: RopDeliveryOptions,
        warnings: string[],
    ): Promise<number> {
        const { domain, kind, periodKey } = options.scope;
        const current = new Set(currentUserIds);
        const recipientsKey = this.keys.recipients(domain, kind);
        const remembered = await this.memory
            .recipients(recipientsKey)
            .catch(() => [] as number[]);
        let closed = 0;
        for (const userId of remembered) {
            if (current.has(userId)) continue;
            const taskKey = this.keys.task(domain, kind, userId);
            const memo: RopTaskMemo | null = await this.memory
                .previous(taskKey)
                .catch(() => null);
            if (memo?.periodKey === periodKey) continue;
            if (memo && (await this.closeTask(memo.taskId, warnings))) {
                closed += 1;
            }
            await this.memory
                .forget(taskKey, recipientsKey, userId)
                .catch(() => undefined);
        }
        return closed;
    }

    private async createTask(
        userId: number,
        report: RopRenderedReport,
        options: RopDeliveryOptions,
        fileId: number | null,
        warnings: string[],
    ): Promise<number | null> {
        try {
            const response = await this.bitrix.task.add({
                TITLE: report.title,
                DESCRIPTION: report.describe(fileId !== null),
                DESCRIPTION_IN_BBCODE: 'Y',
                RESPONSIBLE_ID: userId,
                ...(options.ownerId ? { CREATED_BY: options.ownerId } : {}),
                DEADLINE: BitrixDateTime.fromInstant(
                    options.deadline,
                    options.timezone,
                ).toTaskDeadline(),
                ...(fileId ? { UF_TASK_WEBDAV_FILES: [`n${fileId}`] } : {}),
            });
            const taskId = toId(response?.result?.task?.id);
            if (!taskId) {
                warnings.push(
                    `задача-отчёт сотруднику ${userId} не создана: Битрикс не вернул id`,
                );
            }
            return taskId;
        } catch (error) {
            warnings.push(
                `задача-отчёт сотруднику ${userId} не создана: ${getErrorString(error)}`,
            );
            return null;
        }
    }

    /** Закрыть задачу, если она ещё открыта; true — закрыли сейчас. */
    private async closeTask(
        taskId: number,
        warnings: string[],
    ): Promise<boolean> {
        try {
            const response = await this.bitrix.task.get(taskId, [
                'ID',
                'STATUS',
            ]);
            const status = statusOf(response?.result?.task?.status);
            if (CLOSED_STATUSES.includes(status)) return false;
            await this.bitrix.task.complete(taskId);
            return true;
        } catch (error) {
            warnings.push(
                `прошлая задача-отчёт ${taskId} не закрыта: ${getErrorString(error)}`,
            );
            return false;
        }
    }
}
