import { BitrixService } from '@/modules/bitrix';
import { EBXTaskStatus } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { BitrixDateTime, ETimeZone } from '@lib/shared/lib/date';
import { getErrorString } from '@/shared/lib/utils/get-error-string.util';

/**
 * Хвост названия задачи-сводки: по нему находится и закрывается прошлая
 * задача того же получателя. Названия сводок разные («Ваши забытые
 * сделки», «…вашего отдела»), а маркер один.
 */
export const DEAL_AUDIT_TASK_MARK = 'аудит сделок';

/** Сколько даём на разбор сводки: сутки от постановки. */
const TASK_TTL_MS = 24 * 60 * 60 * 1000;

/** Закрытая задача — закрывать нечего (как в отчёте по дублям). */
const CLOSED_STATUSES: readonly string[] = [
    EBXTaskStatus.COMPLETED,
    EBXTaskStatus.DECLINED,
];

const toId = (raw: unknown): number | null => {
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
};

/**
 * Сводка «Забытые сделки» задачей получателю.
 *
 * Новая задача ЗАМЕЩАЕТ прошлую: открытые задачи-сводки того же человека
 * закрываются, иначе у РОПа копился бы хвост просроченных «сводок» со
 * вчерашними списками. К CRM задача не привязывается — двадцать сделок в
 * одной задаче сбили бы карточки и счётчик открытых задач самого аудита.
 *
 * Не `@Injectable`: инстанс Битрикса приходит параметром (CLAUDE.md).
 * Любой сбой — предупреждение, а не исключение: сводка одному получателю
 * не должна мешать остальным.
 */
export class DealAuditDigestTask {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly timezone: ETimeZone,
    ) {}

    async replace(
        userId: number,
        digest: { heading: string; count: number; text: string },
        warnings: string[],
    ): Promise<number | null> {
        await this.closePrevious(userId, warnings);
        try {
            const response = await this.bitrix.task.add({
                TITLE: `${digest.heading} — ${digest.count} · ${DEAL_AUDIT_TASK_MARK}`,
                DESCRIPTION: digest.text,
                DESCRIPTION_IN_BBCODE: 'Y',
                RESPONSIBLE_ID: userId,
                DEADLINE: BitrixDateTime.fromInstant(
                    new Date(Date.now() + TASK_TTL_MS),
                    this.timezone,
                ).toTaskDeadline(),
            });
            const taskId = toId(response?.result?.task?.id);
            if (!taskId) {
                warnings.push(
                    `задача-сводка сотруднику ${userId} не создана: Битрикс не вернул id`,
                );
            }
            return taskId;
        } catch (error) {
            warnings.push(
                `задача-сводка сотруднику ${userId} не создана: ${getErrorString(error)}`,
            );
            return null;
        }
    }

    /** Открытые задачи-сводки получателя — закрыть; ошибка поиска — предупреждение. */
    private async closePrevious(
        userId: number,
        warnings: string[],
    ): Promise<void> {
        let rows: Array<Record<string, unknown>> = [];
        try {
            const response = await this.bitrix.task.getList(
                {
                    RESPONSIBLE_ID: userId,
                    '%TITLE': DEAL_AUDIT_TASK_MARK,
                } as never,
                ['ID', 'STATUS', 'TITLE'],
            );
            rows = (response?.result?.tasks ?? []) as unknown as Array<
                Record<string, unknown>
            >;
        } catch (error) {
            warnings.push(
                `прошлые задачи-сводки сотрудника ${userId} не прочитаны: ${getErrorString(error)}`,
            );
            return;
        }
        for (const row of rows) {
            const taskId = toId(row.id ?? row.ID);
            const rawStatus = row.status ?? row.STATUS;
            const status =
                typeof rawStatus === 'string' || typeof rawStatus === 'number'
                    ? String(rawStatus)
                    : '';
            if (!taskId || CLOSED_STATUSES.includes(status)) continue;
            try {
                await this.bitrix.task.complete(taskId);
            } catch (error) {
                warnings.push(
                    `прошлая задача-сводка ${taskId} не закрыта: ${getErrorString(error)}`,
                );
            }
        }
    }
}
