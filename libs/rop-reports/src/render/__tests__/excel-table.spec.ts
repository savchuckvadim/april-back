import * as ExcelJS from 'exceljs';
import { ExcelColumn, MONEY_FMT, writeTableSheet } from '../excel-table';

interface Row {
    readonly name: string;
    readonly sum: number;
    readonly url: string;
    readonly gone: boolean;
}

const COLUMNS: readonly ExcelColumn<Row>[] = [
    {
        header: 'Менеджер',
        width: 20,
        value: row => row.name,
        tone: row => (row.gone ? 'red' : null),
    },
    { header: 'Сумма', width: 12, value: row => row.sum, numFmt: MONEY_FMT },
    {
        header: 'Разбор',
        width: 30,
        value: row => ({ text: 'открыть', hyperlink: row.url }),
        wrap: true,
    },
];

const write = (rows: readonly Row[], notes: readonly string[]) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = writeTableSheet(workbook, {
        name: 'Менеджеры и рекомендации за ноябрь 2026 года',
        title: 'Итоги ноября',
        notes,
        columns: COLUMNS,
        rows,
        frozenColumns: 1,
    });
    return { workbook, sheet };
};

describe('лист-таблица Excel отчётов РОПу', () => {
    it('заголовок, заметки, шапка, строки, закрепление и автофильтр', () => {
        const { sheet } = write(
            [
                {
                    name: 'Анна Иванова',
                    sum: 1500,
                    url: 'https://a',
                    gone: false,
                },
                {
                    name: 'Кирилл Сидоров',
                    sum: 0,
                    url: 'https://b',
                    gone: true,
                },
            ],
            ['Неделя 16.11–22.11.', 'Сравнение с отделом — словами.'],
        );

        expect(sheet.name).toHaveLength(31);
        expect(sheet.getCell(1, 1).value).toBe('Итоги ноября');
        expect(sheet.getCell(1, 1).font?.bold).toBe(true);
        expect(sheet.getCell(2, 1).value).toBe('Неделя 16.11–22.11.');
        expect(sheet.getCell(2, 1).isMerged).toBe(true);

        const headerRow = 4;
        expect(sheet.getRow(headerRow).getCell(1).value).toBe('Менеджер');
        expect(sheet.getRow(headerRow).getCell(3).value).toBe('Разбор');
        expect(sheet.getCell(5, 1).value).toBe('Анна Иванова');
        expect(sheet.getCell(5, 2).numFmt).toBe(MONEY_FMT);
        expect(sheet.getCell(5, 3).value).toEqual({
            text: 'открыть',
            hyperlink: 'https://a',
        });
        expect(sheet.getCell(5, 3).font?.underline).toBe(true);
        expect(sheet.getCell(6, 1).font?.color?.argb).toBe('FFC00000');

        expect(sheet.views[0]).toMatchObject({
            state: 'frozen',
            xSplit: 1,
            ySplit: headerRow,
        });
        expect(sheet.autoFilter).toEqual({
            from: { row: headerRow, column: 1 },
            to: { row: headerRow + 2, column: 3 },
        });
    });

    it('без строк — только шапка, фильтр на одну строку ниже неё', () => {
        const { sheet } = write([], []);
        expect(sheet.getRow(2).getCell(1).value).toBe('Менеджер');
        expect(sheet.autoFilter).toEqual({
            from: { row: 2, column: 1 },
            to: { row: 3, column: 3 },
        });
    });

    it('книга сохраняется в xlsx', async () => {
        const { workbook } = write(
            [{ name: 'Анна', sum: 1, url: 'https://a', gone: false }],
            [],
        );
        const buffer = await workbook.xlsx.writeBuffer();
        expect(buffer.byteLength).toBeGreaterThan(0);
    });
});
