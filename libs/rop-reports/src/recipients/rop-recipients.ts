import {
    buildHeadsByUser,
    DepartmentLike,
    headsOf,
    headsOfUsers,
    toId,
} from './department-heads.util';
import { departmentScopeOf } from './department-scope.util';
import {
    ROP_MERGE_POLICY,
    ROP_ORPHAN_POLICY,
    ROP_RECIPIENT_ROLE,
    ROP_RECIPIENT_ROLE_ORDER,
    ROP_STRUCTURE_MISSING_WARNING,
    RopMergePolicy,
    RopRecipientBucket,
    RopRecipientRole,
    RopRecipientSettings,
    RopRoutingInput,
} from './rop-recipients.types';

/**
 * КОМУ ОТЧЁТ — чистые функции над записями отчёта (менеджер, клиент,
 * сделка) и снимком структуры отделов продаж. Обобщение получателей
 * отчёта по дублям (`assignRecipients`) и сводок аудита сделок:
 *  - «по всей структуре — кому» — все записи;
 *  - «по своему отделу — кому» — записи сотрудников отдела получателя и
 *    подотделов;
 *  - «РОПу» — руководителю по структуре с подъёмом по PARENT;
 *  - «сироты» — записи, которых никто из руководства не получил, —
 *    руководителям верхних отделов;
 *  - «сотруднику» — свои записи (роль заложена, в отчётах пока выключена).
 *
 * Человек в нескольких списках получает ОДИН набор: при политике
 * `union` — объединение всех своих ролей (отчёт по дублям), при `widest`
 * — набор самой широкой роли (аудит сделок); «сироты» добавляются при
 * любой политике — их больше никто не увидит.
 *
 * Роли, политики и типы — rop-recipients.types.ts.
 */

/** Роли руководства: только они делают запись «полученной». */
const MANAGEMENT_ROLES: readonly RopRecipientRole[] = [
    ROP_RECIPIENT_ROLE.structure,
    ROP_RECIPIENT_ROLE.department,
    ROP_RECIPIENT_ROLE.head,
];

/** Задан ли хоть один адресат. */
export const hasRopRecipients = (settings: RopRecipientSettings): boolean =>
    settings.toHead ||
    settings.toEmployee ||
    settings.departmentUserIds.length > 0 ||
    settings.structureUserIds.length > 0;

/**
 * Руководители верхних отделов снимка (родителя нет в снимке): им уходят
 * записи, которых «РОПу» никому не отдал.
 */
export const topHeadsOf = (
    departments: readonly DepartmentLike[],
): number[] => {
    const ids = new Set(departments.map(department => toId(department.ID)));
    const result = new Set<number>();
    for (const department of departments) {
        const parent = toId(department.PARENT);
        if (parent !== null && ids.has(parent)) continue;
        for (const headId of headsOf(department)) result.add(headId);
    }
    return [...result].sort((a, b) => a - b);
};

/** Ключи записей по ролям одного получателя. */
type RoleKeys = Map<RopRecipientRole, Set<string>>;

/** Накопитель «кто — в какой роли — какие записи». */
class Grants {
    readonly byUser = new Map<number, RoleKeys>();

    add(userId: number, role: RopRecipientRole, key: string): void {
        if (toId(userId) === null) return;
        const roles =
            this.byUser.get(userId) ?? new Map<RopRecipientRole, Set<string>>();
        const keys = roles.get(role) ?? new Set<string>();
        keys.add(key);
        roles.set(role, keys);
        this.byUser.set(userId, roles);
    }

    /** Ключи, полученные кем-то из руководства. */
    managementKeys(): Set<string> {
        const result = new Set<string>();
        for (const roles of this.byUser.values()) {
            for (const role of MANAGEMENT_ROLES) {
                for (const key of roles.get(role) ?? []) result.add(key);
            }
        }
        return result;
    }
}

/**
 * Получатели и их наборы. Получатели — по возрастанию id (стабильный
 * порядок задач), записи — в порядке входа; получатель без записей
 * отбрасывается.
 */
export function routeRecipients<T>(
    input: RopRoutingInput<T>,
    warnings: string[],
): RopRecipientBucket<T>[] {
    const { items, settings, departments } = input;
    const grants = new Grants();

    for (const userId of settings.structureUserIds) {
        for (const item of items) {
            grants.add(userId, ROP_RECIPIENT_ROLE.structure, input.keyOf(item));
        }
    }

    const needsStructure =
        settings.toHead || settings.departmentUserIds.length > 0;
    if (needsStructure && !departments.length) {
        if (items.length) warnings.push(ROP_STRUCTURE_MISSING_WARNING);
    } else {
        grantByStructure(input, grants);
    }

    if (settings.toEmployee) {
        for (const item of items) {
            for (const ownerId of new Set(input.ownersOf(item))) {
                grants.add(
                    ownerId,
                    ROP_RECIPIENT_ROLE.employee,
                    input.keyOf(item),
                );
            }
        }
    }

    routeOrphans(input, grants, warnings);

    return [...grants.byUser.entries()]
        .sort(([a], [b]) => a - b)
        .map(([userId, roleKeys]) => {
            const roles = ROP_RECIPIENT_ROLE_ORDER.filter(role =>
                roleKeys.has(role),
            );
            const keys = keysOf(roleKeys, roles, input.merge);
            return {
                userId,
                roles,
                items: items.filter(item => keys.has(input.keyOf(item))),
            };
        })
        .filter(bucket => bucket.items.length > 0);
}

/** «РОПу» и «по своему отделу» — по снимку структуры. */
function grantByStructure<T>(input: RopRoutingInput<T>, grants: Grants): void {
    const { items, settings, departments } = input;
    if (settings.toHead) {
        const headsByUser = buildHeadsByUser(departments);
        for (const item of items) {
            const owners = [...input.ownersOf(item)];
            for (const headId of headsOfUsers(headsByUser, owners)) {
                grants.add(headId, ROP_RECIPIENT_ROLE.head, input.keyOf(item));
            }
        }
    }
    for (const userId of settings.departmentUserIds) {
        const scope = departmentScopeOf(departments, userId);
        for (const item of items) {
            if (input.ownersOf(item).some(ownerId => scope.has(ownerId))) {
                grants.add(
                    userId,
                    ROP_RECIPIENT_ROLE.department,
                    input.keyOf(item),
                );
            }
        }
    }
}

/**
 * Записи, которых никто из руководства не получил: все сотрудники записи
 * уволены или вне отдела продаж. При «РОПу» они уходят руководителям
 * верхних отделов; в любом случае — строка предупреждения, чтобы потеря не
 * была молчаливой (кроме политики `ignore`).
 */
function routeOrphans<T>(
    input: RopRoutingInput<T>,
    grants: Grants,
    warnings: string[],
): void {
    if (input.orphans === ROP_ORPHAN_POLICY.ignore) return;
    const received = grants.managementKeys();
    const orphans = input.items.filter(
        item => !received.has(input.keyOf(item)),
    );
    if (!orphans.length) return;

    const heads = input.settings.toHead ? topHeadsOf(input.departments) : [];
    for (const headId of heads) {
        for (const item of orphans) {
            grants.add(headId, ROP_RECIPIENT_ROLE.orphan, input.keyOf(item));
        }
    }
    const label = input.itemsLabel ?? 'записей';
    warnings.push(
        `${label} без получателя: ${orphans.length} (их сотрудники не в отделе продаж или вне выбранных отделов) — ` +
            (heads.length
                ? `отправлены руководителям верхних отделов: ${heads.join(', ')}`
                : 'никому не ушли; укажите получателей «по всей структуре»'),
    );
}

/**
 * Ключи набора по политике: `union` — все роли; `widest` — самая широкая
 * роль, кроме «сирот», плюс «сироты».
 */
function keysOf(
    roleKeys: RoleKeys,
    roles: readonly RopRecipientRole[],
    merge: RopMergePolicy,
): Set<string> {
    if (merge === ROP_MERGE_POLICY.union) {
        return new Set([...roleKeys.values()].flatMap(keys => [...keys]));
    }
    const widest = roles.find(role => role !== ROP_RECIPIENT_ROLE.orphan);
    return new Set([
        ...(widest ? (roleKeys.get(widest) ?? []) : []),
        ...(roleKeys.get(ROP_RECIPIENT_ROLE.orphan) ?? []),
    ]);
}
