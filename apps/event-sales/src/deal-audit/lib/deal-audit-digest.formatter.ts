import {
    DEAL_AUDIT_STATUS,
    DealAuditStatusCode,
} from '../constants/deal-audit.const';
import { DealAuditVerdict } from '../types/deal-audit.types';

/** Русские заголовки групп дайджеста — по статусу сделки. */
const STATUS_TITLE: Record<DealAuditStatusCode, string> = {
    [DEAL_AUDIT_STATUS.forgotClose]: 'Забыли закрыть (продажа или отказ)',
    [DEAL_AUDIT_STATUS.noTask]: 'Без задач',
    [DEAL_AUDIT_STATUS.taskOverdue]: 'Просроченные задачи',
    [DEAL_AUDIT_STATUS.idle]: 'Давно нет работы',
    [DEAL_AUDIT_STATUS.stageStuck]: 'Застряли в стадии',
    [DEAL_AUDIT_STATUS.ok]: 'Норма',
};

/** Цвет заголовка группы: чем хуже, тем тревожнее. */
const STATUS_COLOR: Record<DealAuditStatusCode, string> = {
    [DEAL_AUDIT_STATUS.forgotClose]: '#c62828',
    [DEAL_AUDIT_STATUS.noTask]: '#d97706',
    [DEAL_AUDIT_STATUS.taskOverdue]: '#d97706',
    [DEAL_AUDIT_STATUS.idle]: '#1d74d8',
    [DEAL_AUDIT_STATUS.stageStuck]: '#1d74d8',
    [DEAL_AUDIT_STATUS.ok]: '#2e7d32',
};

/** Порядок групп в письме = порядок важности статусов. */
const STATUS_ORDER: readonly DealAuditStatusCode[] = [
    DEAL_AUDIT_STATUS.forgotClose,
    DEAL_AUDIT_STATUS.noTask,
    DEAL_AUDIT_STATUS.taskOverdue,
    DEAL_AUDIT_STATUS.idle,
    DEAL_AUDIT_STATUS.stageStuck,
];

export interface DealAuditDigestInput {
    readonly domain: string;
    /** Заголовок письма: «Ваши забытые сделки» / «ОП Иванов» и т.п. */
    readonly heading: string;
    readonly verdicts: readonly DealAuditVerdict[];
    /** Сколько строк показывать; остаток сворачивается в «и ещё N». */
    readonly limit: number;
    /** Подписи ответственных (id → имя) — нужны только сводке руководителя. */
    readonly userNames?: ReadonlyMap<number, string>;
}

const dealUrl = (domain: string, dealId: number): string =>
    `https://${domain}/crm/deal/details/${dealId}/`;

/**
 * Дайджест забытых сделок в BB-коде уведомления портала.
 *
 * Чистая функция: ни Битрикса, ни настроек — только текст. Так вёрстку
 * можно править и проверять тестом, не поднимая портал.
 *
 * Возвращает пустую строку, когда показывать нечего: вызывающий код на
 * этом основании НЕ отправляет уведомление, а не шлёт пустое «всё ок»
 * каждый день (такую рассылку выключают на второй неделе).
 */
export const buildDealAuditDigest = (input: DealAuditDigestInput): string => {
    const forgotten = input.verdicts.filter(
        verdict => verdict.status !== DEAL_AUDIT_STATUS.ok,
    );
    if (!forgotten.length) return '';

    const lines: string[] = [
        `[B]${input.heading}[/B]`,
        `Забытых сделок: ${forgotten.length}`,
        '',
    ];

    let shown = 0;
    for (const status of STATUS_ORDER) {
        const group = forgotten.filter(verdict => verdict.status === status);
        if (!group.length) continue;

        lines.push(
            `[B][color=${STATUS_COLOR[status]}]${STATUS_TITLE[status]} — ${group.length}[/color][/B]`,
        );
        for (const verdict of group) {
            if (shown >= input.limit) break;
            shown += 1;
            lines.push(renderRow(input, verdict));
        }
        if (shown >= input.limit) break;
        lines.push('');
    }

    const rest = forgotten.length - shown;
    if (rest > 0) {
        lines.push('', `[i]…и ещё ${rest} — полный список в фильтре CRM[/i]`);
    }
    return lines.join('\n').trim();
};

const renderRow = (
    input: DealAuditDigestInput,
    verdict: DealAuditVerdict,
): string => {
    const url = dealUrl(input.domain, verdict.dealId);
    const owner =
        input.userNames && verdict.assignedById
            ? input.userNames.get(verdict.assignedById)
            : undefined;
    const ownerSuffix = owner ? ` — ${owner}` : '';
    return `>> [url=${url}]#${verdict.dealId} ${verdict.title}[/url]${ownerSuffix}\n   [i]${verdict.comment}[/i]`;
};
