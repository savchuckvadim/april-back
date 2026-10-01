import { BitrixService } from '@/modules/bitrix';
import { getErrorString } from '@/shared/lib/utils/get-error-string.util';
import { EBXTaskStatus } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { BitrixDateTime, ETimeZone } from '@lib/shared/lib/date';
import { scalarText } from '../../event-report/services/entity/scalar-text.util';
import { toId } from '../../shared/department-heads/department-heads.util';
import { DuplicateReportDisk } from './duplicate-report-disk';

/** Где помнится последняя задача-отчёт получателя (Redis). */
export interface DuplicateTaskStorePort {
    previous(domain: string, userId: number): Promise<number | null>;
    remember(domain: string, userId: number, taskId: number): Promise<void>;
    /** Все, кому задача-отчёт уходила и ещё помнится. */
    recipients(domain: string): Promise<number[]>;
    forget(domain: string, userId: number): Promise<void>;
}

/** Одна задача-отчёт: содержимое уже собрано, остаётся доставить. */
export interface DuplicateDeliveryItem {
    readonly userId: number;
    readonly title: string;
    /** Описание зависит от того, удалось ли приложить файл. */
    readonly describe: (fileAttached: boolean) => string;
    readonly fileName: string;
    readonly file: Buffer;
}

export interface DuplicateDeliveryOptions {
    readonly deadline: Date;
    readonly timezone: ETimeZone;
    /** Постановщик — владелец вебхука; null — Битрикс подставит сам. */
    readonly ownerId: number | null;
}

export interface DuplicateDeliveryOutcome {
    readonly taskId: number | null;
    readonly closedPrevious: boolean;
}

/** Задача уже закрыта — закрывать нечего. */
const CLOSED_STATUSES: readonly string[] = [
    EBXTaskStatus.COMPLETED,
    EBXTaskStatus.DECLINED,
];

/**
 * Доставка отчёта: файл на Диск ({@link DuplicateReportDisk}) → задача с
 * файлом → закрыть прошлую задачу-отчёт получателя. Одна ответственность
 * — транспорт; Excel и тексты собираются снаружи.
 *
 * Файл прикладывается к задаче при создании (`UF_TASK_WEBDAV_FILES:
 * ['n' + id]` в `tasks.task.add` — так в официальной документации):
 * участники видят вложение по правам задачи, отдельная раздача прав не
 * нужна. К CRM задача НЕ привязывается: в карточке клиента она сбила бы
 * менеджеров и аудит забытых сделок (счётчик открытых задач).
 *
 * НЕ `@Injectable`: инстанс Битрикса приходит параметром (CLAUDE.md).
 * Любой сбой — предупреждение, а не исключение: отчёт одному получателю
 * не должен мешать остальным.
 */
export class DuplicateReportDelivery {
    private readonly disk: DuplicateReportDisk;

    constructor(
        private readonly bitrix: BitrixService,
        private readonly store: DuplicateTaskStorePort,
        private readonly domain: string,
    ) {
        this.disk = new DuplicateReportDisk(bitrix);
    }

    async deliver(
        item: DuplicateDeliveryItem,
        options: DuplicateDeliveryOptions,
        warnings: string[],
    ): Promise<DuplicateDeliveryOutcome> {
        const fileId = await this.disk.upload(
            { name: item.fileName, content: item.file },
            options.ownerId,
            warnings,
        );
        const taskId = await this.createTask(item, options, fileId, warnings);
        if (!taskId) return { taskId: null, closedPrevious: false };
        const closedPrevious = await this.replacePrevious(
            item.userId,
            taskId,
            warnings,
        );
        return { taskId, closedPrevious };
    }

    /**
     * Закрыть прошлые задачи-отчёты тех, кому отчёта в этот раз нет:
     * дубли разобраны, получателя убрали из настроек или он больше не
     * руководитель. Иначе задача со старым списком висела бы и просрочивалась.
     *
     * @returns сколько задач закрыто.
     */
    async closeStale(
        currentUserIds: readonly number[],
        warnings: string[],
    ): Promise<number> {
        const current = new Set(currentUserIds);
        const remembered = await this.store
            .recipients(this.domain)
            .catch(() => [] as number[]);
        let closed = 0;
        for (const userId of remembered) {
            if (current.has(userId)) continue;
            const taskId = await this.store
                .previous(this.domain, userId)
                .catch(() => null);
            if (taskId && (await this.closeTask(taskId, warnings))) closed += 1;
            await this.store.forget(this.domain, userId).catch(() => undefined);
        }
        return closed;
    }

    private async createTask(
        item: DuplicateDeliveryItem,
        options: DuplicateDeliveryOptions,
        fileId: number | null,
        warnings: string[],
    ): Promise<number | null> {
        try {
            const response = await this.bitrix.task.add({
                TITLE: item.title,
                DESCRIPTION: item.describe(fileId !== null),
                DESCRIPTION_IN_BBCODE: 'Y',
                RESPONSIBLE_ID: item.userId,
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
                    `задача-отчёт сотруднику ${item.userId} не создана: Битрикс не вернул id`,
                );
            }
            return taskId;
        } catch (error) {
            warnings.push(
                `задача-отчёт сотруднику ${item.userId} не создана: ${getErrorString(error)}`,
            );
            return null;
        }
    }

    /**
     * Новая задача заменяет прошлую: прошлую закрываем (если она ещё
     * открыта) и запоминаем новую. Актуальный список у получателя всегда
     * один — в последней задаче.
     */
    private async replacePrevious(
        userId: number,
        taskId: number,
        warnings: string[],
    ): Promise<boolean> {
        const previous = await this.store
            .previous(this.domain, userId)
            .catch(() => null);
        const closed =
            previous && previous !== taskId
                ? await this.closeTask(previous, warnings)
                : false;
        await this.store
            .remember(this.domain, userId, taskId)
            .catch((error: unknown) =>
                warnings.push(
                    `задача-отчёт ${taskId} не запомнена — через неделю её не закроют: ${getErrorString(error)}`,
                ),
            );
        return closed;
    }

    private async closeTask(
        taskId: number,
        warnings: string[],
    ): Promise<boolean> {
        try {
            const response = await this.bitrix.task.get(taskId, [
                'ID',
                'STATUS',
            ]);
            const status = scalarText(response?.result?.task?.status);
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
