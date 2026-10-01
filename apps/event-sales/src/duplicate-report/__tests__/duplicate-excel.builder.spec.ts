import * as ExcelJS from 'exceljs';
import { ETimeZone } from '@lib/shared/lib/date';
import {
    buildDuplicateWorkbook,
    DUPLICATE_SHEET,
} from '../excel/duplicate-excel.builder';
import { classifyClients } from '../lib/duplicate-classify';
import { ClassifiedClient } from '../types/duplicate-report.types';
import {
    CLASSIFY_OPTIONS,
    DAY,
    DOMAIN,
    makeClientInput,
    makeDeal,
    makeLead,
    NAMES,
    NOW,
} from './fixtures/duplicate-report.fixture';

/** Клиенты: решить (двое работают), дубль от автоматики, дубль-заявка. */
const CLIENTS: ClassifiedClient[] = classifyClients(
    [
        makeClientInput(
            [
                makeDeal(500, { companyId: 50, openTasks: 1 }),
                makeDeal(501, {
                    companyId: 50,
                    assignedById: 12,
                    openTasks: 1,
                }),
            ],
            { ref: { kind: 'company', id: 50 }, title: 'Альфа' },
        ),
        makeClientInput(
            [
                makeDeal(600, {
                    companyId: 60,
                    stageOrder: 6,
                    opportunity: 55524,
                }),
                makeDeal(601, {
                    companyId: 60,
                    assignedById: 99,
                    title: 'Сделка #601',
                    createdById: 447,
                    createdAt: NOW - 3 * DAY,
                }),
            ],
            { ref: { kind: 'company', id: 60 }, title: 'Бета' },
        ),
        makeClientInput(
            [
                makeDeal(700, { companyId: null, contactId: 70 }),
                makeDeal(701, {
                    companyId: null,
                    contactId: 70,
                    sourceLeadId: 77,
                    lead: makeLead(77, NOW - 20 * DAY, {
                        sourceName: 'База Актион',
                    }),
                    // 23:30 МСК 01.10 = 20:30 UTC: дата в Excel — 01.10.
                    createdAt: Date.UTC(2026, 9, 1, 20, 30),
                }),
            ],
            { ref: { kind: 'contact', id: 70 }, title: 'Иванов Иван' },
        ),
    ],
    CLASSIFY_OPTIONS,
);

const load = async (): Promise<ExcelJS.Workbook> => {
    const buffer = await buildDuplicateWorkbook({
        domain: DOMAIN,
        timezone: ETimeZone.EUROPE_MOSCOW,
        period: {
            from: new Date(NOW - 7 * DAY),
            to: new Date(NOW),
            label: '28.09–04.10',
        },
        clients: CLIENTS,
        userNames: NAMES,
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    return workbook;
};

/** Строка шапки: заголовок + заметки + 1. */
const headerRowOf = (sheet: ExcelJS.Worksheet): number => {
    for (let row = 1; row <= 10; row += 1) {
        if (sheet.getCell(row, 1).value === '№') return row;
        if (sheet.getCell(row, 1).value === 'Клиент') return row;
    }
    throw new Error('шапка не найдена');
};

const linkOf = (cell: ExcelJS.Cell): string =>
    (cell.value as ExcelJS.CellHyperlinkValue).hyperlink;

describe('Excel отчёта по дублям', () => {
    let workbook: ExcelJS.Workbook;

    beforeAll(async () => {
        workbook = await load();
    });

    it('четыре листа в порядке отчёта', () => {
        expect(workbook.worksheets.map(sheet => sheet.name)).toEqual([
            DUPLICATE_SHEET.summary,
            DUPLICATE_SHEET.decide,
            DUPLICATE_SHEET.join,
            DUPLICATE_SHEET.deals,
        ]);
    });

    it('«Сводка»: строка на клиента, ссылки на карточки, основная жирной ссылкой', () => {
        const sheet = workbook.getWorksheet(DUPLICATE_SHEET.summary)!;
        const header = headerRowOf(sheet);
        expect(sheet.getCell(header, 2).value).toBe('Клиент');
        const first = sheet.getRow(header + 1);
        expect(linkOf(first.getCell(2))).toBe(
            `https://${DOMAIN}/crm/company/details/50/`,
        );
        expect(linkOf(first.getCell(5))).toBe(
            `https://${DOMAIN}/crm/deal/details/500/`,
        );
        expect(first.getCell(5).font.bold).toBe(true);
        expect(first.getCell(5).font.name).toBe('Arial');
        const contactRow = sheet.getRow(header + 3);
        expect(linkOf(contactRow.getCell(2))).toBe(
            `https://${DOMAIN}/crm/contact/details/70/`,
        );
        expect(sheet.rowCount).toBe(header + CLIENTS.length);
    });

    it('«не работает» — красным, сумма — числом с форматом рублей', () => {
        const sheet = workbook.getWorksheet(DUPLICATE_SHEET.summary)!;
        const row = sheet.getRow(headerRowOf(sheet) + 2);
        expect(row.getCell(10).value).toBe('Пётр Уволенный (не работает)');
        expect(row.getCell(10).font.color?.argb).toBe('FFC00000');
        expect(row.getCell(8).value).toBe(55524);
        expect(row.getCell(8).numFmt).toContain('₽');
    });

    it('шапка закреплена, автофильтр включён', () => {
        const sheet = workbook.getWorksheet(DUPLICATE_SHEET.summary)!;
        const header = headerRowOf(sheet);
        expect(sheet.views[0]).toMatchObject({
            state: 'frozen',
            ySplit: header,
            xSplit: 2,
        });
        expect(sheet.autoFilter).toBeTruthy();
    });

    it('«Решить руководителю» — только клиенты для решения', () => {
        const sheet = workbook.getWorksheet(DUPLICATE_SHEET.decide)!;
        const header = headerRowOf(sheet);
        expect(sheet.getCell(header, 5).value).toBe('Сделка дальше по воронке');
        expect(
            (sheet.getCell(header + 1, 2).value as ExcelJS.CellHyperlinkValue)
                .text,
        ).toBe('Альфа');
        expect(sheet.rowCount).toBe(header + 1);
    });

    it('«Присоединить к основной» — сгруппировано по тому, как появилась сделка', () => {
        const sheet = workbook.getWorksheet(DUPLICATE_SHEET.join)!;
        const header = headerRowOf(sheet);
        const origins = [header + 1, header + 2].map(
            row => sheet.getCell(row, 14).value,
        );
        expect(origins).toEqual(['новая заявка', 'автоматика']);
        expect(sheet.getCell(3, 1).text).toContain(
            'новая заявка (1) — клиент обратился снова',
        );
    });

    it('по клиенту — «Откуда сделки» (источник и дата лида) и «Как вели»', () => {
        const sheet = workbook.getWorksheet(DUPLICATE_SHEET.summary)!;
        const header = headerRowOf(sheet);
        expect(sheet.getCell(header, 15).value).toBe('Откуда сделки (лиды)');
        expect(sheet.getCell(header, 16).value).toBe('Как вели');
        // Альфа: у обоих ответственных свои задачи.
        expect(sheet.getCell(header + 1, 16).value).toBe(
            'параллельно: Иван Петров и Анна Сидорова',
        );
        // Контакт 70: лид из «Актиона» 15.09.26.
        expect(sheet.getCell(header + 3, 15).value).toBe(
            'База Актион 15.09.26',
        );
    });

    it('«Все сделки»: строка на сделку, роль, лид со ссылкой, дата — день портала', () => {
        const sheet = workbook.getWorksheet(DUPLICATE_SHEET.deals)!;
        const header = headerRowOf(sheet);
        expect(sheet.rowCount).toBe(header + 6);
        const rows = Array.from({ length: 6 }, (_, index) =>
            sheet.getRow(header + 1 + index),
        );
        const leadRow = rows.find(
            row =>
                (row.getCell(2).value as ExcelJS.CellHyperlinkValue).text ===
                '701',
        )!;
        expect(leadRow.getCell(3).value).toBe('присоединить');
        expect(linkOf(leadRow.getCell(15))).toBe(
            `https://${DOMAIN}/crm/lead/details/77/`,
        );
        expect(leadRow.getCell(16).value).toBe('Лид 77');
        expect(leadRow.getCell(18).value).toBe('База Актион · заявка');
        expect(leadRow.getCell(9).value).toEqual(
            new Date(Date.UTC(2026, 9, 1)),
        );
        const mainRow = rows.find(
            row =>
                (row.getCell(2).value as ExcelJS.CellHyperlinkValue).text ===
                '600',
        )!;
        expect(mainRow.getCell(3).value).toBe('основная');
        expect(mainRow.getCell(2).font.bold).toBe(true);
    });
});
