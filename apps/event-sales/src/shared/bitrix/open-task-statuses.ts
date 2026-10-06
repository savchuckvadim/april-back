import { EBXTaskStatus } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';

/**
 * ОТКРЫТАЯ ЗАДАЧА = по ней есть (или только что была) работа сотрудника.
 * Правило отчёта по дублям: он отвечает на вопрос «кто вёл клиента», и
 * задача, которую исполнитель завершил и которая ждёт приёмки
 * постановщиком («Ждёт контроля»), — тоже свидетельство работы.
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

/**
 * ПРЕДСТОЯЩАЯ ЗАДАЧА = её ещё предстоит сделать: она напомнит сотруднику о
 * клиенте. Правило аудита сделок: он отвечает на вопрос «вернётся ли
 * кто-нибудь к этой сделке сам».
 *
 * «Ждёт контроля» сюда НЕ входит: исполнитель задачу уже закрыл, в его
 * списке дел её нет, о клиенте она не напомнит никому. На портале
 * заказчика таких задач тысячи (старые сигналы, поставленные с приёмкой), и
 * сделка, у которой остались только они, для аудита — без задач (разбор
 * 05.10.2026).
 */
export const PENDING_TASK_STATUSES: readonly string[] = [
    EBXTaskStatus.NEW,
    EBXTaskStatus.PENDING,
    EBXTaskStatus.IN_PROGRESS,
];

export const isPendingTaskStatus = (status: string): boolean =>
    PENDING_TASK_STATUSES.includes(status);
