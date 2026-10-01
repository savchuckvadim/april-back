import { DUPLICATE_ORIGIN_LABEL } from '../constants/duplicate-report.const';
import {
    actionText,
    howWorkedText,
    mainOf,
    othersOf,
    responsibleLabel,
} from '../lib/duplicate-report-texts';
import {
    ClassifiedClient,
    ClassifiedDeal,
} from '../types/duplicate-report.types';
import {
    clientLink,
    dealLink,
    DuplicateExcelContext,
    leadOriginsText,
    yes,
} from './duplicate-excel.cells';
import { ExcelColumn, MONEY_FMT } from './duplicate-excel.table';

/** Строка листа клиентов: клиент и его номер в листе. */
export interface ClientRow {
    readonly index: number;
    readonly client: ClassifiedClient;
}

/** Подписи колонок основной и второй сделки — у каждого листа свои. */
export interface ClientColumnLabels {
    readonly main: string;
    readonly second: string;
}

export const SUMMARY_LABELS: ClientColumnLabels = {
    main: 'Основная (предложение)',
    second: 'Вторая сделка',
};

export const JOIN_LABELS: ClientColumnLabels = {
    main: 'Основная (оставить)',
    second: 'Присоединить',
};

export const DECIDE_LABELS: ClientColumnLabels = {
    main: 'Сделка дальше по воронке',
    second: 'Вторая сделка',
};

const secondOf = (row: ClientRow): ClassifiedDeal | null =>
    othersOf(row.client)[0] ?? null;

/** Третья и дальше — текстом: такое редко, а ссылки есть в «Все сделки». */
const restText = (row: ClientRow, ctx: DuplicateExcelContext): string | null =>
    othersOf(row.client)
        .slice(1)
        .map(
            item =>
                `${item.deal.id} — ${responsibleLabel(item, ctx.userNames)}, ${item.deal.stageName}`,
        )
        .join('\n') || null;

/**
 * Колонки листов по клиентам («Сводка», «Решить руководителю»,
 * «Присоединить к основной»): строка — клиент; основная и вторая сделка
 * — ссылками с ответственным и стадией, как в разборе 30.09.
 */
export function clientColumns(
    ctx: DuplicateExcelContext,
    labels: ClientColumnLabels,
): ExcelColumn<ClientRow>[] {
    const main = (row: ClientRow): ClassifiedDeal => mainOf(row.client);
    return [
        { header: '№', width: 5, value: row => row.index },
        {
            header: 'Клиент',
            width: 36,
            wrap: true,
            value: row => clientLink(ctx, row.client),
        },
        { header: 'ИНН', width: 14, value: row => row.client.inn || null },
        {
            header: 'Открытых сделок',
            width: 9,
            value: row => row.client.deals.length,
        },
        {
            header: labels.main,
            width: 12,
            value: row => dealLink(ctx, main(row).deal.id),
            tone: () => 'bold',
        },
        {
            header: 'Ответственный',
            width: 22,
            wrap: true,
            value: row => responsibleLabel(main(row), ctx.userNames),
            tone: row => (main(row).working ? null : 'red'),
        },
        {
            header: 'Стадия',
            width: 16,
            wrap: true,
            value: row => main(row).deal.stageName,
        },
        {
            header: 'Сумма',
            width: 12,
            numFmt: MONEY_FMT,
            value: row => main(row).deal.opportunity,
        },
        {
            header: labels.second,
            width: 12,
            value: row => {
                const second = secondOf(row);
                return second ? dealLink(ctx, second.deal.id) : null;
            },
        },
        {
            header: 'Ответственный',
            width: 22,
            wrap: true,
            value: row => {
                const second = secondOf(row);
                return second ? responsibleLabel(second, ctx.userNames) : null;
            },
            tone: row => (secondOf(row)?.working === false ? 'red' : null),
        },
        {
            header: 'Стадия',
            width: 16,
            wrap: true,
            value: row => secondOf(row)?.deal.stageName ?? null,
        },
        {
            header: 'Ещё сделки',
            width: 30,
            wrap: true,
            value: row => restText(row, ctx),
        },
        {
            header: 'Самая свежая',
            width: 12,
            value: row => dealLink(ctx, row.client.freshestDealId),
        },
        {
            header: 'Как появилась',
            width: 24,
            wrap: true,
            value: row => DUPLICATE_ORIGIN_LABEL[row.client.origin],
        },
        {
            header: 'Откуда сделки (лиды)',
            width: 30,
            wrap: true,
            value: row => leadOriginsText(row.client, ctx.timezone),
        },
        {
            header: 'Как вели',
            width: 30,
            wrap: true,
            value: row => howWorkedText(row.client, ctx.userNames),
        },
        {
            header: 'Что сделать',
            width: 48,
            wrap: true,
            value: row => actionText(row.client, ctx.userNames),
        },
        {
            header: 'Новое за неделю',
            width: 10,
            value: row => yes(row.client.newThisWeek),
        },
    ];
}
