import {
    buildHeadsByUser,
    DepartmentLike,
    headsOf,
    headsOfUsers,
    toId,
} from '../../shared/department-heads/department-heads.util';
import { departmentScopeOf } from '../../shared/department-heads/department-scope.util';
import {
    DUPLICATE_RECIPIENT_ROLE,
    DuplicateRecipientRole,
} from '../constants/duplicate-report.const';
import {
    ClassifiedClient,
    DuplicateRecipientReport,
    DuplicateRecipientsSettings,
} from '../types/duplicate-report.types';
import { clientKey } from './duplicate-groups';

/**
 * КОМУ ОТЧЁТ — чистые функции над уже разобранными клиентами и снимком
 * структуры отделов (bx-department). Правила адресатов те же, что у
 * сводок аудита сделок: «РОПу» — по руководителям в структуре (с подъёмом
 * по PARENT), «по своему отделу» — отдел получателя и все подотделы,
 * «по всей структуре» — всё.
 *
 * Человек может стоять в нескольких списках сразу — он всё равно получает
 * ОДНУ задачу и один файл с объединённым набором клиентов.
 */

export const STRUCTURE_MISSING_WARNING =
    'структура отдела продаж не прочитана — отчёт руководителям и «по своему отделу» не собран';

/** Порядок ролей в тексте задачи: от широкой к узкой. */
const ROLE_ORDER: readonly DuplicateRecipientRole[] = [
    DUPLICATE_RECIPIENT_ROLE.structure,
    DUPLICATE_RECIPIENT_ROLE.department,
    DUPLICATE_RECIPIENT_ROLE.head,
    DUPLICATE_RECIPIENT_ROLE.orphan,
];

/**
 * Руководители верхних отделов снимка (родителя нет в снимке): им уходят
 * клиенты, которых «Отчёт РОПу» никому не отдал.
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

/** Задан ли хоть один адресат: одно правило для отчёта и для Telegram. */
export const hasDuplicateRecipients = (
    settings: DuplicateRecipientsSettings,
): boolean =>
    settings.toHead ||
    settings.departmentUserIds.length > 0 ||
    settings.structureUserIds.length > 0;

/** Ответственные сделок клиента без повторов. */
export const ownersOf = (client: ClassifiedClient): number[] => [
    ...new Set(
        client.deals
            .map(item => item.deal.assignedById)
            .filter((id): id is number => id !== null),
    ),
];

/**
 * Получатели и их клиенты. Порядок клиентов у каждого — общий порядок
 * отчёта; получатели — по возрастанию id (стабильный порядок задач).
 */
export function assignRecipients(
    clients: readonly ClassifiedClient[],
    departments: readonly DepartmentLike[],
    settings: DuplicateRecipientsSettings,
    warnings: string[],
): DuplicateRecipientReport[] {
    const buckets = new Map<number, RecipientBucket>();
    const add = (
        userId: number,
        role: DuplicateRecipientRole,
        client: ClassifiedClient,
    ): void => {
        const bucket = buckets.get(userId) ?? {
            roles: new Set<DuplicateRecipientRole>(),
            keys: new Set<string>(),
        };
        bucket.roles.add(role);
        bucket.keys.add(clientKey(client.ref));
        buckets.set(userId, bucket);
    };

    for (const userId of settings.structureUserIds) {
        for (const client of clients) {
            add(userId, DUPLICATE_RECIPIENT_ROLE.structure, client);
        }
    }

    const needsStructure =
        settings.toHead || settings.departmentUserIds.length > 0;
    if (needsStructure && !departments.length) {
        if (clients.length) warnings.push(STRUCTURE_MISSING_WARNING);
    } else {
        if (settings.toHead) {
            const headsByUser = buildHeadsByUser(departments);
            for (const client of clients) {
                for (const headId of headsOfUsers(
                    headsByUser,
                    ownersOf(client),
                )) {
                    add(headId, DUPLICATE_RECIPIENT_ROLE.head, client);
                }
            }
        }
        for (const userId of settings.departmentUserIds) {
            const scope = departmentScopeOf(departments, userId);
            for (const client of clients) {
                if (ownersOf(client).some(ownerId => scope.has(ownerId))) {
                    add(userId, DUPLICATE_RECIPIENT_ROLE.department, client);
                }
            }
        }
    }

    routeOrphans(clients, departments, settings, buckets, add, warnings);

    return [...buckets.entries()]
        .sort(([a], [b]) => a - b)
        .map(([userId, bucket]) => ({
            userId,
            roles: ROLE_ORDER.filter(role => bucket.roles.has(role)),
            clients: clients.filter(client =>
                bucket.keys.has(clientKey(client.ref)),
            ),
        }))
        .filter(report => report.clients.length > 0);
}

interface RecipientBucket {
    readonly roles: Set<DuplicateRecipientRole>;
    readonly keys: Set<string>;
}

/**
 * Клиенты, которых никто не получил. Так бывает, когда все ответственные
 * клиента уволены или ушли из отдела продаж: в снимке структуры их нет, и
 * «Отчёт РОПу» не находит руководителя. При «Отчёте РОПу» такие клиенты
 * уходят руководителям верхних отделов; в любом случае — строка в
 * Telegram, чтобы потеря не была молчаливой.
 */
function routeOrphans(
    clients: readonly ClassifiedClient[],
    departments: readonly DepartmentLike[],
    settings: DuplicateRecipientsSettings,
    buckets: ReadonlyMap<number, RecipientBucket>,
    add: (
        userId: number,
        role: DuplicateRecipientRole,
        client: ClassifiedClient,
    ) => void,
    warnings: string[],
): void {
    const received = new Set(
        [...buckets.values()].flatMap(bucket => [...bucket.keys]),
    );
    const orphans = clients.filter(
        client => !received.has(clientKey(client.ref)),
    );
    if (!orphans.length) return;

    const heads = settings.toHead ? topHeadsOf(departments) : [];
    for (const headId of heads) {
        for (const client of orphans) {
            add(headId, DUPLICATE_RECIPIENT_ROLE.orphan, client);
        }
    }
    warnings.push(
        `клиентов без получателя: ${orphans.length} (ответственные не в отделе продаж или вне выбранных отделов) — ` +
            (heads.length
                ? `отправлены руководителям верхних отделов: ${heads.join(', ')}`
                : 'никому не ушли; укажите «Отчёт по дублям: по всей структуре — кому»'),
    );
}
