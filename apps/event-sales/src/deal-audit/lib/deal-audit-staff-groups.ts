import { IBXDepartment } from '@/modules/bitrix/domain/interfaces/bitrix.interface';

/**
 * Группа сотрудников, чьи сделки аудит берёт одним запросом.
 *
 * Решение владельца (05.10.2026): за прогон — не больше 50 сделок на отдел,
 * самые давние по последней активности. Отдел здесь — узел структуры
 * продаж со своими сотрудниками; подотделы идут отдельными группами.
 */
export interface DealAuditStaffGroup {
    /** Название отдела — для предупреждений и лога. */
    readonly title: string;
    readonly userIds: readonly number[];
}

const toUserId = (raw: unknown): number | null => {
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
};

/**
 * Отделы продаж → группы сотрудников.
 *
 * Сотрудник, числящийся в нескольких отделах, попадает в первую встреченную
 * группу: иначе одни и те же сделки приходили бы дважды и съедали лимит
 * второго отдела. Отделы без сотрудников в группы не попадают — запрос
 * «сделки никого» вернул бы всю воронку.
 */
export const buildDealAuditStaffGroups = (
    departments: readonly IBXDepartment[],
): DealAuditStaffGroup[] => {
    const taken = new Set<number>();
    const seenDepartments = new Set<number>();
    const groups: DealAuditStaffGroup[] = [];

    for (const department of departments) {
        const departmentId = Number(department.ID);
        if (seenDepartments.has(departmentId)) continue;
        seenDepartments.add(departmentId);

        const userIds: number[] = [];
        for (const user of department.USERS ?? []) {
            const id = toUserId(user?.ID);
            if (id === null || taken.has(id)) continue;
            taken.add(id);
            userIds.push(id);
        }
        if (!userIds.length) continue;

        groups.push({
            title:
                String(department.NAME ?? '').trim() || `Отдел ${departmentId}`,
            userIds,
        });
    }
    return groups;
};

/** Все сотрудники отделов продаж — чтобы отдельно взять сделки «вне отделов». */
export const staffGroupUserIds = (
    groups: readonly DealAuditStaffGroup[],
): number[] => groups.flatMap(group => [...group.userIds]);

/** Название группы сделок, чей ответственный не состоит в отделах продаж. */
export const DEAL_AUDIT_OUTSIDE_GROUP_TITLE = 'вне отделов продаж';
