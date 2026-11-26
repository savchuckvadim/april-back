import {
    Workbook,
    type Comment,
    type FillPattern,
    type Worksheet,
} from 'exceljs';
import {
    DownLoadKpiReportDto,
    DownloadKpiReportItemDto,
    EDownloadType,
} from '../dto/get-excel-report.dto';
import { PLAN_FILL_ARGB } from '../lib/excel-plan-columns.util';
import { ExcelReportService } from '../services/excel-report.service';

/**
 * Excel KPI-отчёта с плановыми колонками (kind = plan): заметка у шапки,
 * плановая заливка, «—» без плана, без строк «— план», рейтинги без планов.
 * Проверяется по книге, прочитанной обратно из буфера.
 */
const NOTE =
    'План по показателю «Презентация» (на месяц), пересчитан на выбранный период';

const plain = (id: string, action: string, count: number) => ({
    id,
    action,
    count,
});
const plan = (count: number | null) => ({
    id: 'plan:presentations_done',
    action: 'План: Презентация',
    count,
    kind: 'plan' as const,
    note: NOTE,
});

const row = (
    id: number,
    userName: string,
    calls: number,
    presentationPlan: number | null,
    presentations: number,
    withPlanColumn: boolean,
): DownloadKpiReportItemDto => ({
    id,
    userName,
    kpi: [
        plain('call_done', 'Звонок', calls),
        ...(withPlanColumn ? [plan(presentationPlan)] : []),
        plain('presentation_done', 'Презентация', presentations),
    ],
});

function dtoOf(withPlanColumn: boolean): DownLoadKpiReportDto {
    return {
        type: EDownloadType.EXCEL,
        date: { from: '2026-11-01', to: '2026-11-30' },
        report: [
            row(1, 'Иванов Пётр', 5, 10, 3, withPlanColumn),
            row(2, 'Петров Иван', 7, null, 1, withPlanColumn),
        ],
        plans: {
            columns: [],
            units: [],
            rows: [],
            total: [],
            mainRows: [
                {
                    userId: 1,
                    cells: [{ code: 'presentation_done', plan: 10 }],
                },
            ],
        },
    };
}

async function render(dto: DownLoadKpiReportDto): Promise<Workbook> {
    const buffer = await new ExcelReportService().generateExcel(dto);
    const workbook = new Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    return workbook;
}

/** Значения строки листа без пустой ячейки-заглушки exceljs. */
const valuesOf = (sheet: Worksheet, rowNumber: number): unknown[] =>
    (sheet.getRow(rowNumber).values as unknown[]).slice(1);

const fgOf = (fill: unknown): string | undefined =>
    (fill as FillPattern | undefined)?.fgColor?.argb;

const noteText = (note: string | Comment | undefined): string =>
    typeof note === 'string'
        ? note
        : (note?.texts ?? []).map(part => part.text).join('');

/** Номер первой строки листа, где в первой ячейке стоит текст. */
function rowNumberOf(sheet: Worksheet, text: string): number {
    for (let index = 1; index <= sheet.rowCount; index += 1) {
        if (sheet.getRow(index).getCell(1).value === text) return index;
    }
    return -1;
}

describe('ExcelReportService: плановые колонки на основном листе', () => {
    it('шапка: заметка у плановой колонки, сама шапка — как у остальных', async () => {
        const sheet = (await render(dtoOf(true))).getWorksheet('KPI Отчет');
        const headNumber = rowNumberOf(sheet!, 'ФИО');
        const head = sheet!.getRow(headNumber);

        expect(valuesOf(sheet!, headNumber)).toEqual([
            'ФИО',
            'Звонок',
            'План: Презентация',
            'Презентация',
        ]);
        expect(noteText(head.getCell(3).note)).toBe(NOTE);
        expect(head.getCell(2).note).toBeUndefined();
        expect(fgOf(head.getCell(3).fill)).toBe(fgOf(head.getCell(2).fill));
    });

    it('сотрудники и итог: плановая заливка, «—» без плана, итог — сумма (без плана = 0)', async () => {
        const sheet = (await render(dtoOf(true))).getWorksheet('KPI Отчет')!;
        const ivanov = rowNumberOf(sheet, 'Иванов Пётр');
        const petrov = rowNumberOf(sheet, 'Петров Иван');
        const total = rowNumberOf(sheet, 'Итого');

        expect(valuesOf(sheet, ivanov)).toEqual(['Иванов Пётр', 5, 10, 3]);
        expect(valuesOf(sheet, petrov)).toEqual(['Петров Иван', 7, '—', 1]);
        expect(valuesOf(sheet, total)).toEqual(['Итого', 12, 10, 4]);
        for (const rowNumber of [ivanov, petrov, total]) {
            const cells = sheet.getRow(rowNumber);
            expect(fgOf(cells.getCell(3).fill)).toBe(PLAN_FILL_ARGB);
            expect(fgOf(cells.getCell(2).fill)).not.toBe(PLAN_FILL_ARGB);
            expect(fgOf(cells.getCell(4).fill)).not.toBe(PLAN_FILL_ARGB);
        }
    });

    it('при плановых колонках строки «— план» под сотрудниками не выводятся', async () => {
        const sheet = (await render(dtoOf(true))).getWorksheet('KPI Отчет')!;

        expect(rowNumberOf(sheet, '— план')).toBe(-1);
        expect(rowNumberOf(sheet, 'Петров Иван')).toBe(
            rowNumberOf(sheet, 'Иванов Пётр') + 1,
        );
    });

    it('без плановых колонок — как раньше: строка «— план» есть, заметок нет', async () => {
        const sheet = (await render(dtoOf(false))).getWorksheet('KPI Отчет')!;
        const ivanov = rowNumberOf(sheet, 'Иванов Пётр');
        const head = sheet.getRow(rowNumberOf(sheet, 'ФИО'));

        expect(rowNumberOf(sheet, '— план')).toBe(ivanov + 1);
        expect(sheet.getRow(ivanov + 1).getCell(3).value).toBe(10);
        expect(head.getCell(2).note).toBeUndefined();
        expect(head.getCell(3).note).toBeUndefined();
    });

    it('листы рейтингов без плановых колонок', async () => {
        const sheet = (await render(dtoOf(true))).getWorksheet(
            'Рейтинг — Сотрудники',
        )!;
        const titles: unknown[] = [];
        sheet.eachRow(current => {
            titles.push(current.getCell(1).value);
        });

        expect(titles).toContain('Звонок');
        expect(titles).toContain('Презентация');
        expect(titles).not.toContain('План: Презентация');
        // Значения рейтинга «Презентация» — из своей колонки, а не из плановой.
        const presentation = rowNumberOf(sheet, 'Презентация');
        expect(valuesOf(sheet, presentation + 2)).toEqual([
            1,
            'Иванов Пётр',
            3,
        ]);
    });
});
