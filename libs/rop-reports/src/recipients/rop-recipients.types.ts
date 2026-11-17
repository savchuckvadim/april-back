import { DepartmentLike } from './department-heads.util';

/**
 * Контракт выбора получателей отчётов РОПу: роли, политики слияния и
 * сирот, настройки адресатов, вход и результат `routeRecipients`
 * (rop-recipients.ts). Отдельный файл — чтобы сигнатура была видна целиком
 * и не менялась вместе с алгоритмом.
 */

export const ROP_RECIPIENT_ROLE = {
    /** «По всей структуре — кому»: все записи отчёта. */
    structure: 'structure',
    /** «По своему отделу — кому»: отдел получателя и подотделы. */
    department: 'department',
    /** Руководитель по структуре («РОПу»). */
    head: 'head',
    /** Руководитель верхнего отдела: записи без получателя из руководства. */
    orphan: 'orphan',
    /** Сам сотрудник — свои записи («сводка сотруднику»). */
    employee: 'employee',
} as const;

export type RopRecipientRole =
    (typeof ROP_RECIPIENT_ROLE)[keyof typeof ROP_RECIPIENT_ROLE];

/** От широкой роли к узкой: порядок ролей получателя и приоритет `widest`. */
export const ROP_RECIPIENT_ROLE_ORDER = [
    ROP_RECIPIENT_ROLE.structure,
    ROP_RECIPIENT_ROLE.department,
    ROP_RECIPIENT_ROLE.head,
    ROP_RECIPIENT_ROLE.orphan,
    ROP_RECIPIENT_ROLE.employee,
] as const satisfies readonly RopRecipientRole[];

/** Как сводить роли одного получателя в один набор записей. */
export const ROP_MERGE_POLICY = {
    /** Объединение записей всех ролей (отчёт по дублям, итоги периода). */
    union: 'union',
    /** Записи самой широкой роли (аудит сделок, движение сделок). */
    widest: 'widest',
} as const;

export type RopMergePolicy =
    (typeof ROP_MERGE_POLICY)[keyof typeof ROP_MERGE_POLICY];

/** Что делать с записями, которых никто из руководства не получил. */
export const ROP_ORPHAN_POLICY = {
    /** При «РОПу» — руководителям верхних отделов; всегда — предупреждение. */
    topHeads: 'top_heads',
    /** Ничего: ни получателей, ни предупреждения (аудит сделок). */
    ignore: 'ignore',
} as const;

export type RopOrphanPolicy =
    (typeof ROP_ORPHAN_POLICY)[keyof typeof ROP_ORPHAN_POLICY];

/** Адресаты из настроек портала. */
export interface RopRecipientSettings {
    /** «РОПу»: руководителю — записи его сотрудников. */
    readonly toHead: boolean;
    /** «Сотруднику»: каждому — его записи. */
    readonly toEmployee: boolean;
    /** «По своему отделу — кому» (Bitrix ID). */
    readonly departmentUserIds: readonly number[];
    /** «По всей структуре — кому» (Bitrix ID). */
    readonly structureUserIds: readonly number[];
}

export interface RopRoutingInput<T> {
    readonly items: readonly T[];
    /** Уникальный ключ записи: по нему сводятся наборы получателя. */
    keyOf(item: T): string;
    /** Сотрудники, чья это запись (ответственные, менеджер карточки). */
    ownersOf(item: T): readonly number[];
    /** Снимок структуры отделов продаж (`loadSalesDepartments`). */
    readonly departments: readonly DepartmentLike[];
    readonly settings: RopRecipientSettings;
    readonly merge: RopMergePolicy;
    readonly orphans: RopOrphanPolicy;
    /** Как назвать записи в предупреждении: «клиентов», «менеджеров». */
    readonly itemsLabel?: string;
}

/** Получатель и его набор записей: одна задача и один файл. */
export interface RopRecipientBucket<T> {
    readonly userId: number;
    /** Все роли получателя, от широкой к узкой. */
    readonly roles: readonly RopRecipientRole[];
    /** Записи по политике слияния, в порядке входа. */
    readonly items: readonly T[];
}

export const ROP_STRUCTURE_MISSING_WARNING =
    'структура отдела продаж не прочитана — отчёт руководителям и «по своему отделу» не собран';
