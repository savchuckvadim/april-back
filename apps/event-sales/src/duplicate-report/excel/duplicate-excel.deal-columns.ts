import {
    dealRoleLabel,
    originLabel,
    personName,
    shortActionText,
} from '../lib/duplicate-report-texts';
import {
    ClassifiedClient,
    ClassifiedDeal,
} from '../types/duplicate-report.types';
import {
    clientLink,
    dealLink,
    DuplicateExcelContext,
    excelDate,
    leadLink,
    leadSource,
    yes,
} from './duplicate-excel.cells';
import {
    DATE_FMT,
    ExcelCellTone,
    ExcelColumn,
    MONEY_FMT,
} from './duplicate-excel.table';

/** Строка листа «Все сделки». */
export interface DealRow {
    readonly client: ClassifiedClient;
    readonly item: ClassifiedDeal;
}

const mainTone = (row: DealRow): ExcelCellTone =>
    row.item.isMain ? 'bold' : null;

/** Колонки «Все сделки»: строка — сделка с ролью, датами и лидом. */
export function dealColumns(
    ctx: DuplicateExcelContext,
): ExcelColumn<DealRow>[] {
    return [
        {
            header: 'Клиент',
            width: 34,
            wrap: true,
            value: row => clientLink(ctx, row.client),
        },
        {
            header: 'Сделка',
            width: 10,
            value: row => dealLink(ctx, row.item.deal.id),
            tone: mainTone,
        },
        {
            header: 'Роль',
            width: 18,
            wrap: true,
            value: row => dealRoleLabel(row.client, row.item),
            tone: mainTone,
        },
        {
            header: 'Самая свежая',
            width: 9,
            value: row => yes(row.item.isFreshest),
        },
        {
            header: 'Ответственный',
            width: 22,
            wrap: true,
            value: row => personName(row.item.deal.assignedById, ctx.userNames),
            tone: row => (row.item.working ? null : 'red'),
        },
        {
            header: 'Работает',
            width: 9,
            value: row => (row.item.working ? 'да' : 'нет'),
        },
        {
            header: 'Стадия',
            width: 16,
            wrap: true,
            value: row => row.item.deal.stageName,
        },
        {
            header: 'Сумма',
            width: 12,
            numFmt: MONEY_FMT,
            value: row => row.item.deal.opportunity,
        },
        {
            header: 'Создана',
            width: 11,
            numFmt: DATE_FMT,
            value: row => excelDate(row.item.deal.createdAt, ctx.timezone),
        },
        {
            header: 'Изменена',
            width: 11,
            numFmt: DATE_FMT,
            value: row => excelDate(row.item.deal.modifiedAt, ctx.timezone),
        },
        {
            header: 'Открытых задач',
            width: 9,
            value: row => row.item.deal.openTasks,
        },
        {
            header: 'Из них у ответственного',
            width: 11,
            value: row => row.item.deal.ownOpenTasks,
        },
        {
            header: 'Ведёт сам',
            width: 9,
            value: row => yes(row.item.recentWork),
        },
        {
            header: 'Как появилась',
            width: 24,
            wrap: true,
            value: row => originLabel(row.item),
        },
        { header: 'Лид', width: 10, value: row => leadLink(ctx, row.item) },
        {
            header: 'Название лида',
            width: 30,
            wrap: true,
            value: row => row.item.deal.lead?.title || null,
        },
        {
            header: 'Лид создан',
            width: 11,
            numFmt: DATE_FMT,
            value: row =>
                excelDate(row.item.deal.lead?.createdAt ?? null, ctx.timezone),
        },
        {
            header: 'Источник лида',
            width: 24,
            wrap: true,
            value: row => leadSource(row.item.deal.lead),
        },
        {
            header: 'Присоединено заявок',
            width: 11,
            value: row => row.item.deal.joinedLeads,
        },
        {
            header: 'Что сделать',
            width: 26,
            wrap: true,
            value: row => shortActionText(row.client),
        },
    ];
}
