import * as ExcelJS from 'exceljs';
import { ETimeZone } from '@lib/shared/lib/date';
import {
    DUPLICATE_ACTION,
    DUPLICATE_JOIN_HOW,
    DUPLICATE_MERGE_WARNING,
    DUPLICATE_ORIGIN_HINT,
    DUPLICATE_ORIGIN_LABEL,
    DUPLICATE_ORIGIN_ORDER,
    DUPLICATE_RECENT_WORK_DAYS,
} from '../constants/duplicate-report.const';
import {
    ClassifiedClient,
    DuplicateReportPeriod,
} from '../types/duplicate-report.types';
import { DuplicateExcelContext } from './duplicate-excel.cells';
import {
    clientColumns,
    ClientRow,
    DECIDE_LABELS,
    JOIN_LABELS,
    SUMMARY_LABELS,
} from './duplicate-excel.client-columns';
import { dealColumns } from './duplicate-excel.deal-columns';
import { writeTableSheet } from './duplicate-excel.table';

/** Вкладки книги — в этом порядке их видит получатель. */
export const DUPLICATE_SHEET = {
    summary: 'Сводка',
    decide: 'Решить руководителю',
    join: 'Присоединить к основной',
    deals: 'Все сделки',
} as const;

export interface DuplicateWorkbookInput {
    readonly domain: string;
    readonly timezone: ETimeZone;
    readonly period: DuplicateReportPeriod;
    /** Клиенты получателя в порядке отчёта. */
    readonly clients: readonly ClassifiedClient[];
    readonly userNames: ReadonlyMap<number, string>;
}

const EMPTY_NOTE = 'Таких клиентов на этой неделе нет.';

const numbered = (clients: readonly ClassifiedClient[]): ClientRow[] =>
    clients.map((client, index) => ({ index: index + 1, client }));

const originRank = (client: ClassifiedClient): number =>
    DUPLICATE_ORIGIN_ORDER.indexOf(client.origin);

/**
 * Книга Excel отчёта по дублям одного получателя: «Сводка» (строка —
 * клиент), «Решить руководителю», «Присоединить к основной» (сгруппировано
 * по тому, как появилась сделка) и «Все сделки» (строка — сделка).
 *
 * Чистая сборка: ни Битрикса, ни настроек — на входе уже разобранные
 * клиенты, на выходе файл. Поэтому книгу проверяет тест, читая её обратно.
 */
export async function buildDuplicateWorkbook(
    input: DuplicateWorkbookInput,
): Promise<Buffer> {
    const ctx: DuplicateExcelContext = {
        domain: input.domain,
        timezone: input.timezone,
        userNames: input.userNames,
    };
    const decide = input.clients.filter(
        client => client.action === DUPLICATE_ACTION.decide,
    );
    const join = input.clients
        .filter(client => client.action === DUPLICATE_ACTION.join)
        .sort((a, b) => originRank(a) - originRank(b));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'April';

    writeTableSheet(workbook, {
        name: DUPLICATE_SHEET.summary,
        title: 'Клиенты с несколькими открытыми сделками в воронке продаж',
        notes: summaryNotes(input, decide.length),
        columns: clientColumns(ctx, SUMMARY_LABELS),
        rows: numbered(input.clients),
        frozenColumns: 2,
    });
    writeTableSheet(workbook, {
        name: DUPLICATE_SHEET.decide,
        title: 'Решить руководителю: кто ведёт клиента',
        notes: [
            'Клиента ведут два работающих менеджера (у каждого свои ' +
                'открытые задачи по сделке или свои дела за последние ' +
                `${DUPLICATE_RECENT_WORK_DAYS} дней; общая задача на две ` +
                'сделки — уже ведут как одного клиента) либо у сделок разные ' +
                'ИНН. Решите, кто ведёт клиента, и присоедините остальные ' +
                'сделки к его сделке; при разных ИНН сначала проверьте, ' +
                'одна ли это организация — до проверки не присоединяйте.',
            ...(decide.length ? [] : [EMPTY_NOTE]),
        ],
        columns: clientColumns(ctx, DECIDE_LABELS),
        rows: numbered(decide),
        frozenColumns: 2,
    });
    writeTableSheet(workbook, {
        name: DUPLICATE_SHEET.join,
        title: 'Присоединить к основной',
        notes: joinNotes(join),
        columns: clientColumns(ctx, JOIN_LABELS),
        rows: numbered(join),
        frozenColumns: 2,
    });
    writeTableSheet(workbook, {
        name: DUPLICATE_SHEET.deals,
        title: 'Все сделки клиентов из отчёта',
        notes: [
            'Одна строка — одна сделка: роль, ответственный, даты, лид и ' +
                'его источник. Жирным — сделка, которую предлагается ' +
                'оставить основной; фильтры — в шапке таблицы.',
        ],
        columns: dealColumns(ctx),
        rows: input.clients.flatMap(client =>
            client.deals.map(item => ({ client, item })),
        ),
        frozenColumns: 2,
    });

    return Buffer.from(await workbook.xlsx.writeBuffer());
}

const summaryNotes = (
    input: DuplicateWorkbookInput,
    decide: number,
): string[] => {
    const clients = input.clients;
    const deals = clients.reduce((sum, client) => sum + client.deals.length, 0);
    const fresh = clients.filter(client => client.newThisWeek).length;
    return [
        `Неделя ${input.period.label}. Клиентов — ${clients.length}, ` +
            `открытых сделок у них — ${deals}; решить руководителю — ` +
            `${decide}, присоединить к основной — ${clients.length - decide}, ` +
            `новых за неделю — ${fresh}.`,
        'Основная — сделку предлагается оставить: работающий ответственный, ' +
            'дальше по воронке, есть сумма и нормальное название. «Самая ' +
            'свежая» — сделка с последними изменениями: к ней присоединится ' +
            'новая заявка клиента. «(не работает)» красным — ответственный ' +
            'уволен или в отделе неработающих.',
        `Как присоединить: ${DUPLICATE_JOIN_HOW}`,
        DUPLICATE_MERGE_WARNING,
    ];
};

const joinNotes = (join: readonly ClassifiedClient[]): string[] => {
    if (!join.length) return [EMPTY_NOTE];
    const groups = DUPLICATE_ORIGIN_ORDER.map(origin => ({
        origin,
        count: join.filter(client => client.origin === origin).length,
    })).filter(group => group.count > 0);
    return [
        'Обычные дубли: присоедините сделки из колонок «Присоединить» и ' +
            '«Ещё сделки» к основной. Строки сгруппированы по тому, как ' +
            'появилась последняя сделка клиента:',
        ...groups.map(
            group =>
                `• ${DUPLICATE_ORIGIN_LABEL[group.origin]} (${group.count}) — ` +
                `${DUPLICATE_ORIGIN_HINT[group.origin]}.`,
        ),
    ];
};
