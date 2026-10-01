import { EBXTaskStatus } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';

/**
 * ОТКРЫТАЯ ЗАДАЧА = ещё делается. Одно правило на аудит сделок и отчёт по
 * дублям, чтобы «по сделке идёт работа» у них не расходилось.
 *
 * «Завершена» и «Отклонена» очевидно закрыты, а «Отложена» сюда не
 * попадает намеренно: отложенная задача никому не напомнит о клиенте, и
 * считать её работой значило бы прятать забытые сделки.
 */
export const OPEN_TASK_STATUSES: readonly string[] = [
    EBXTaskStatus.NEW,
    EBXTaskStatus.PENDING,
    EBXTaskStatus.IN_PROGRESS,
    EBXTaskStatus.SUPPOSEDLY_COMPLETED,
];

export const isOpenTaskStatus = (status: string): boolean =>
    OPEN_TASK_STATUSES.includes(status);
