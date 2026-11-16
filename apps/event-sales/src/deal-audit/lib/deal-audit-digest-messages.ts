import { DEAL_AUDIT_STATUS } from '../constants/deal-audit.const';
import { DealAuditVerdict } from '../types/deal-audit.types';
import {
    buildDealAuditDigest,
    DEAL_AUDIT_DIGEST_SCOPE_NOTE,
    DEAL_AUDIT_STATUS_ORDER,
    DEAL_AUDIT_STATUS_SHORT,
    DealAuditDigestInput,
} from './deal-audit-digest.formatter';

/** Подпись сделок без ответственного в сводке руководителя. */
const NO_OWNER = 'Без ответственного';

interface OwnerGroup {
    readonly ownerId: number;
    readonly name: string;
    readonly verdicts: readonly DealAuditVerdict[];
}

/**
 * Сводка «Забытые сделки» серией личных сообщений — как легаси deals-order
 * у отдела сервиса (владелец, 16.11.2026).
 *
 * - Своя сводка менеджера (без подписей ответственных) — одно сообщение.
 * - Сводка руководителя, отдела или всей структуры — первое сообщение с
 *   итогом по сотрудникам (сколько и каких забытых), дальше по сообщению
 *   на сотрудника с его сделками. Одним сообщением 300 сделок не
 *   показать: лимит строк обрезал бы список до первых двадцати, а
 *   сообщение Битрикса — не длиннее 20 000 символов.
 *
 * Чистая функция: вёрстка проверяется тестом без портала. Пусто, когда
 * показывать нечего, — тогда сообщений нет вовсе.
 */
export const buildDealAuditMessages = (
    input: DealAuditDigestInput,
): string[] => {
    const forgotten = input.verdicts.filter(
        verdict => verdict.status !== DEAL_AUDIT_STATUS.ok,
    );
    if (!forgotten.length) return [];
    if (!input.userNames) return [buildDealAuditDigest(input)];

    const groups = groupByOwner(forgotten, input.userNames);
    return [
        renderSummary(input.heading, forgotten.length, groups),
        ...groups.map(group =>
            buildDealAuditDigest({
                domain: input.domain,
                heading: `Сотрудник: ${group.name}`,
                verdicts: group.verdicts,
                limit: input.limit,
                withScopeNote: false,
            }),
        ),
    ];
};

const groupByOwner = (
    verdicts: readonly DealAuditVerdict[],
    userNames: ReadonlyMap<number, string>,
): OwnerGroup[] => {
    const byOwner = new Map<number, DealAuditVerdict[]>();
    for (const verdict of verdicts) {
        const ownerId = verdict.assignedById ?? 0;
        const list = byOwner.get(ownerId) ?? [];
        list.push(verdict);
        byOwner.set(ownerId, list);
    }
    return [...byOwner]
        .map(([ownerId, list]) => ({
            ownerId,
            name: ownerId
                ? (userNames.get(ownerId) ?? `ID ${ownerId}`)
                : NO_OWNER,
            verdicts: list,
        }))
        .sort(
            (a, b) =>
                b.verdicts.length - a.verdicts.length ||
                a.name.localeCompare(b.name, 'ru'),
        );
};

/** «без задач 5, просроченные задачи 3» — в порядке важности статусов. */
const statusBreakdown = (verdicts: readonly DealAuditVerdict[]): string =>
    DEAL_AUDIT_STATUS_ORDER.map(status => ({
        status,
        count: verdicts.filter(verdict => verdict.status === status).length,
    }))
        .filter(item => item.count > 0)
        .map(item => `${DEAL_AUDIT_STATUS_SHORT[item.status]} ${item.count}`)
        .join(', ');

const renderSummary = (
    heading: string,
    total: number,
    groups: readonly OwnerGroup[],
): string =>
    [
        `[B]${heading}[/B]`,
        `Забытых сделок: ${total}, сотрудников: ${groups.length}`,
        '',
        ...groups.map(
            group =>
                `>> [B]${group.name}[/B] — ${group.verdicts.length}: ${statusBreakdown(group.verdicts)}`,
        ),
        '',
        '[i]Ниже — сделки каждого сотрудника отдельным сообщением.[/i]',
        `[i]${DEAL_AUDIT_DIGEST_SCOPE_NOTE}[/i]`,
    ].join('\n');
