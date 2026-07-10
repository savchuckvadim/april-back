/** Тип узла структуры компании */
export enum EBxHrNodeType {
    DEPARTMENT = 'DEPARTMENT',
    TEAM = 'TEAM',
}

/** Роли участников узла (для отделов и команд наборы разные) */
export enum EBxHrMemberRole {
    HEAD = 'MEMBER_HEAD',
    DEPUTY_HEAD = 'MEMBER_DEPUTY_HEAD',
    EMPLOYEE = 'MEMBER_EMPLOYEE',
    TEAM_HEAD = 'MEMBER_TEAM_HEAD',
    TEAM_DEPUTY_HEAD = 'MEMBER_TEAM_DEPUTY_HEAD',
    TEAM_EMPLOYEE = 'MEMBER_TEAM_EMPLOYEE',
}

/** Цвета команд */
export type TBxHrTeamColor =
    | 'blue'
    | 'green'
    | 'cyan'
    | 'orange'
    | 'purple'
    | 'pink';

/** Узел структуры: отдел или команда */
export interface IBXHrNode {
    id: number;
    name: string;
    type: EBxHrNodeType;
    structureId: number;
    parentId: number | null;
    description: string;
    accessCode: string;
    userCount: number;
    colorName: string | null;
    xmlId: string | null;
    createdAt: string | null;
    updatedAt: string | null;
}

/** Участник узла (элемент members) */
export interface IBXHrNodeMember {
    userId: number;
    name: string;
    workPosition: string | null;
    role: EBxHrMemberRole;
    avatar: string | null;
    url: string;
}

/** Узел с участниками (select: ['members']) */
export interface IBXHrNodeWithMembers extends IBXHrNode {
    members: IBXHrNodeMember[];
}

/** Поля узла, доступные в select */
export type THrNodeField =
    | 'id'
    | 'name'
    | 'type'
    | 'structureId'
    | 'parentId'
    | 'description'
    | 'accessCode'
    | 'userCount'
    | 'colorName'
    | 'xmlId'
    | 'createdAt'
    | 'updatedAt'
    | 'members';

/** Сортировка списка узлов */
export type THrNodeOrder = Partial<
    Record<'id' | 'name' | 'createdAt' | 'updatedAt', 'ASC' | 'DESC'>
>;

/**
 * Фильтр списка узлов в формате кортежей:
 * `['id', '>=', 1]`, `['id', 1]`, `['id', 'in', [1, 2]]`.
 *
 * ВНИМАНИЕ: параметр заявлен в OpenAPI-спеке, но на живых порталах
 * (проверено 07.2026) пока ИГНОРИРУЕТСЯ — возвращается нефильтрованный
 * список. Перед использованием проверяйте на своём портале.
 */
export type THrNodeFilterTuple =
    | [string, string | number]
    | [string, string, string | number | Array<string | number>];

/**
 * Состав пользователей по ролям — для node.add и member.set.
 * Ключи — роли (для отдела и команды наборы разные), значения — id пользователей.
 */
export type THrMemberRoleMap = Partial<Record<EBxHrMemberRole, number[]>>;

/** Краткая ссылка на узел в данных сотрудника */
export interface IBXHrNodeRef {
    id: number;
    name: string;
}

/** Сотрудник в ответах humanresources.employee.* */
export interface IBXHrEmployee {
    userId: number;
    name: string;
    workPosition: string | null;
    avatar: string | null;
    url: string;
    /** Отделы сотрудника (если запрошены в select) */
    departments?: IBXHrNodeRef[];
    /** Команды сотрудника (если запрошены в select) */
    teams?: IBXHrNodeRef[];
}

/** Поля сотрудника, доступные в select методов employee.* */
export type THrEmployeeField =
    | 'userId'
    | 'name'
    | 'workPosition'
    | 'avatar'
    | 'url'
    | 'departments'
    | 'teams';

/** Отдел с числом подчинённых (employee.subordinates) */
export interface IBXHrSubordinatesNode {
    nodeId: number;
    name: string;
    role: string;
    subordinatesCount: number;
}

/** Сотрудник в нескольких отделах (employee.multidepartment) */
export interface IBXHrMultidepartmentEmployee {
    userId: number;
    name: string;
    workPosition: string | null;
    departments: IBXHrNodeRef[];
}

/** Узел дерева структуры с участниками (композиция getSubtreeWithMembers) */
export interface IBXHrNodeTree {
    node: IBXHrNodeWithMembers;
    children: IBXHrNodeTree[];
}
