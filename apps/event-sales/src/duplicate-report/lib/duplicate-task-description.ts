import { crmCardUrl } from '@lib/bitrix/consts/timeline.consts';
import {
    DUPLICATE_ACTION,
    DUPLICATE_JOIN_HOW,
    DUPLICATE_MERGE_WARNING,
    DUPLICATE_RECIPIENT_ROLE_LABEL,
    DUPLICATE_TASK_TOP,
} from '../constants/duplicate-report.const';
import {
    ClassifiedClient,
    DuplicateRecipientReport,
    DuplicateReportPeriod,
} from '../types/duplicate-report.types';
import { responsibleLabel, shortActionText } from './duplicate-report-texts';

/**
 * Название и описание задачи-отчёта (BB-код, `DESCRIPTION_IN_BBCODE`).
 *
 * Чистые функции: вёрстку проверяет тест, а не портал. Задача идёт прямым
 * вызовом `tasks.task.add`, не batch-командой — переносы остаются обычными
 * `\n`, экранировать под batch-провод нечего.
 */

export interface DuplicateTaskTextInput {
    readonly domain: string;
    readonly period: DuplicateReportPeriod;
    readonly report: DuplicateRecipientReport;
    readonly userNames: ReadonlyMap<number, string>;
    /** Файл Excel приложен к задаче. */
    readonly fileAttached: boolean;
}

/** «Дубли сделок: отчёт за неделю 22.09–28.09». */
export const duplicateTaskTitle = (period: DuplicateReportPeriod): string =>
    `Дубли сделок: отчёт за неделю ${period.label}`;

/**
 * Имя файла: дефис вместо тире — одинаково читается во всех системах; имя
 * получателя — чтобы файлы разных руководителей в папке отчётов не
 * превращались в «(1)», «(2)». Запрещённые в именах файлов символы — прочь.
 */
export const duplicateFileName = (
    period: DuplicateReportPeriod,
    recipientName: string | null = null,
): string => {
    const who = (recipientName ?? '')
        .replace(/[\\/:*?"<>|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return `Дубли сделок ${period.label.replace('–', '-')}${who ? ` — ${who}` : ''}.xlsx`;
};

/** Текст извне (название клиента, имя) внутри BB-кода: скобки ломают разметку. */
const bbSafe = (text: string): string =>
    String(text ?? '')
        .replace(/\[/g, '(')
        .replace(/\]/g, ')')
        .replace(/\s+/g, ' ')
        .trim();

const clip = (text: string, max: number): string => {
    const value = bbSafe(text);
    return value.length > max ? `${value.slice(0, max - 1).trim()}…` : value;
};

const link = (url: string, text: string): string =>
    `[URL=${url}]${bbSafe(text)}[/URL]`;

const row = (cells: readonly string[], header = false): string =>
    `[TR]${cells
        .map(cell => `[TD]${header ? `[B]${cell}[/B]` : cell}[/TD]`)
        .join('')}[/TR]`;

const clientCell = (domain: string, client: ClassifiedClient): string =>
    link(
        crmCardUrl(domain, client.ref.kind, client.ref.id),
        clip(client.title, 70),
    ) + (client.newThisWeek ? ' · новое' : '');

const dealsCell = (
    domain: string,
    client: ClassifiedClient,
    names: ReadonlyMap<number, string>,
): string =>
    client.deals
        .map(item => {
            const ref = link(
                crmCardUrl(domain, 'deal', item.deal.id),
                String(item.deal.id),
            );
            const who = bbSafe(responsibleLabel(item, names));
            return `${item.isMain ? `[B]${ref}[/B]` : ref} ${who}`;
        })
        .join(' · ');

/** Описание задачи: цифры, первые клиенты таблицей, что делать. */
export function buildDuplicateTaskDescription(
    input: DuplicateTaskTextInput,
): string {
    const { domain, report, userNames } = input;
    const clients = report.clients;
    const decide = clients.filter(
        client => client.action === DUPLICATE_ACTION.decide,
    ).length;
    const deals = clients.reduce((sum, client) => sum + client.deals.length, 0);
    const fresh = clients.filter(client => client.newThisWeek).length;
    const top = clients.slice(0, DUPLICATE_TASK_TOP);
    const scope = report.roles[0]
        ? DUPLICATE_RECIPIENT_ROLE_LABEL[report.roles[0]]
        : DUPLICATE_RECIPIENT_ROLE_LABEL.head;

    const table = [
        '[TABLE]',
        row(['№', 'Клиент', 'Сделки', 'Что сделать'], true),
        ...top.map((client, index) =>
            row([
                String(index + 1),
                clientCell(domain, client),
                dealsCell(domain, client, userNames),
                shortActionText(client),
            ]),
        ),
        '[/TABLE]',
    ].join('\n');

    const rest = clients.length - top.length;
    return [
        '[B]Клиенты с несколькими открытыми сделками в воронке продаж[/B]',
        `Неделя ${input.period.label}, в отчёте ${scope}.`,
        `Клиентов — ${clients.length}, открытых сделок у них — ${deals}. ` +
            `Решить руководителю — ${decide}, присоединить к основной — ` +
            `${clients.length - decide}, новых за неделю — ${fresh}.`,
        '',
        `[B]Первые ${top.length} из ${clients.length}[/B] — жирным сделка, ` +
            'которую предлагается оставить основной:',
        table,
        input.fileAttached
            ? rest > 0
                ? `Остальные ${rest} и подробности по каждой сделке — в файле Excel во вложении.`
                : 'Подробности по каждой сделке — в файле Excel во вложении.'
            : 'Файл Excel приложить не удалось — попросите разработчика прислать полный отчёт.',
        '',
        '[B]Что делать[/B]',
        '1. «Решить руководителю» — клиента ведут два работающих ' +
            'менеджера: решите, кто ведёт клиента, и присоедините ' +
            'остальные сделки к его сделке.',
        '2. «Проверить ИНН» — у сделок разные ИНН: сначала проверьте, одна ' +
            'ли это организация. До проверки не присоединяйте — ' +
            'присоединение смешает историю разных организаций.',
        `3. «Присоединить к основной» — ${DUPLICATE_JOIN_HOW}`,
        `4. [B]${DUPLICATE_MERGE_WARNING}[/B]`,
        '',
        'Отчёт приходит раз в неделю; прошлая задача с отчётом при этом ' +
            'закрывается сама — актуальный список всегда в последней задаче.',
    ].join('\n');
}
