import { NamedDepartmentUser, toId, userNamesOf } from '@lib/rop-reports';
import type {
    DigestBatchManager,
    ManagerDigestCard,
} from '@lib/sales-ai-analytics';

/**
 * Кому подводить итоги периода: сотрудники отделов продаж (основные и
 * дочерние отделы снимка структуры) плюс те, кто звонил в периоде и имел
 * карточку в прошлом периоде (ушёл из отдела продаж посреди периода), минус
 * исключённые настройкой. Звонившие вне отделов продаж без прошлой карточки
 * карточек не получают: иначе итоги пришли бы по сервису и бухгалтерии.
 * Чистые функции.
 */

/** Отдел снимка структуры (структурно = IBXDepartment). */
export interface DigestStructureDepartment {
    readonly ID: number | string;
    readonly NAME?: string | null;
    readonly USERS?: readonly NamedDepartmentUser[] | null;
}

export interface DigestManagersInput {
    /** Основные и дочерние отделы продаж (без предков). */
    readonly departments: readonly DigestStructureDepartment[];
    /** Менеджеры со звонками в периоде (id строкой, как в звонках). */
    readonly callerIds: ReadonlySet<string>;
    /** Карточки прошлого периода того же вида по менеджеру. */
    readonly previousCards: ReadonlyMap<string, ManagerDigestCard>;
    readonly excludeUserIds: ReadonlySet<number>;
}

/** Подпись сотрудника без имени в структуре. */
export const unnamedManager = (id: string): string => `Сотрудник ${id}`;

const departmentName = (department: DigestStructureDepartment): string | null =>
    department.NAME?.trim() || null;

/** Менеджеры выпуска по фамилии, без повторов. */
export function digestManagersOf(
    input: DigestManagersInput,
): DigestBatchManager[] {
    const names = userNamesOf(input.departments);
    const managers = new Map<string, DigestBatchManager>();
    for (const department of input.departments) {
        const departmentId = toId(department.ID);
        for (const user of department.USERS ?? []) {
            const userId = toId(user.ID);
            if (userId === null || input.excludeUserIds.has(userId)) continue;
            const id = String(userId);
            if (managers.has(id)) continue;
            managers.set(id, {
                id,
                name: names.get(userId) ?? unnamedManager(id),
                departmentId,
                departmentName: departmentName(department),
            });
        }
    }
    for (const id of input.callerIds) {
        const card = input.previousCards.get(id);
        const userId = toId(id);
        if (!card || managers.has(id)) continue;
        if (userId === null || input.excludeUserIds.has(userId)) continue;
        managers.set(id, {
            id,
            name: card.managerName,
            departmentId: card.departmentId,
            departmentName: card.departmentName,
        });
    }
    return [...managers.values()].sort(
        (a, b) =>
            a.name.localeCompare(b.name, 'ru') || a.id.localeCompare(b.id),
    );
}
