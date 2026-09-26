import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    IBXDepartment,
    IBXUser,
} from 'src/modules/bitrix/domain/interfaces/bitrix.interface';

/**
 * Поиск отделов по названию в мультирежиме структуры и сбор их
 * сотрудников — чистые функции BxDepartmentStructureService.
 */

/** Шаблоны названий отделов по группе для поиска по всей структуре. */
const DEPARTMENT_NAME_PATTERNS: Record<EDepartamentGroup, RegExp[]> = {
    [EDepartamentGroup.sales]: [/^оп(\s|$)/i, /отдел\s+продаж/i],
    [EDepartamentGroup.service]: [/^ос(\s|$)/i, /отдел\s+сервиса/i],
    [EDepartamentGroup.tmc]: [],
};

/**
 * Признак группы внутри ОП — подотдел с названием «Группа …».
 * Прочие подотделы группами не считаются, но их сотрудники
 * остаются в allUsers отдела (в некоторых ОП сотрудники лежат
 * напрямую или в негрупповых подотделах).
 */
const GROUP_NAME_PATTERN = /группа/i;

/** Экранирование пользовательского тэга перед вставкой в RegExp. */
const escapeRegExp = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Часть ключа кеша по тэгу (разные тэги — разные наборы отделов). */
export const tagCacheKey = (multipleTag: string | null): string =>
    (multipleTag ?? '').trim().replace(/\s+/g, '-').toLowerCase() || 'default';

/**
 * Токен в скобках — маркер вида «(ОП)»: ищется как подстрока в любом
 * месте названия (скобки сами отсекают ложные совпадения вроде «ОПТ»).
 * Прочий токен — префикс названия со словограницей.
 */
const tokenToPattern = (token: string): RegExp => {
    if (token.startsWith('(') && token.endsWith(')')) {
        return new RegExp(escapeRegExp(token), 'i');
    }
    return new RegExp(`^${escapeRegExp(token)}(\\s|$)`, 'i');
};

/** «ОП ОС» → [/^ОП(\s|$)/i, /^ОС(\s|$)/i]; «(ОП)» → [/\(ОП\)/i]. */
const tagToPatterns = (tag: string): RegExp[] =>
    tag
        .split(/[\s,;]+/)
        .map(token => token.trim())
        .filter(Boolean)
        .map(tokenToPattern);

/**
 * Шаблоны поиска отделов: если у отдела задан multiple_tag — ищем по нему
 * (список префиксов через пробел/запятую, напр. «ОП ОС»); иначе — прежние
 * захардкоженные шаблоны группы.
 */
export const resolvePatterns = (
    group: EDepartamentGroup,
    multipleTag: string | null,
): RegExp[] => {
    const tag = multipleTag?.trim();
    if (tag) {
        return tagToPatterns(tag);
    }
    return DEPARTMENT_NAME_PATTERNS[group] ?? [];
};

export const isGroupName = (name: string): boolean =>
    GROUP_NAME_PATTERN.test((name ?? '').trim());

export const matchesName = (name: string, patterns: RegExp[]): boolean => {
    const normalized = (name ?? '').trim();
    return patterns.some(pattern => pattern.test(normalized));
};

/** Уникальные (по ID) сотрудники набора отделов. */
export const collectUsers = (departments: IBXDepartment[]): IBXUser[] => {
    const byId = new Map<number, IBXUser>();
    for (const department of departments) {
        for (const user of department.USERS ?? []) {
            const id = Number(user?.ID);
            if (user && !Number.isNaN(id) && !byId.has(id)) {
                byId.set(id, user);
            }
        }
    }
    return [...byId.values()];
};
