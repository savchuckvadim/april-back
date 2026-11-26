import { Workbook, type FillPattern } from 'exceljs';
import {
    applyPlanHeadNotes,
    fillPlanCells,
    hasPlanColumns,
    kpiCellValue,
    PLAN_EMPTY_VALUE,
    PLAN_FILL_ARGB,
    planSubRowsOf,
    ratingColumns,
    type ExcelKpiColumn,
} from '../lib/excel-plan-columns.util';

const NOTE =
    'План по показателю «Презентация» (на месяц), пересчитан на выбранный период';

const KPIS: ExcelKpiColumn[] = [
    { action: 'Звонок', count: 5 },
    { action: 'План: Презентация', count: null, kind: 'plan', note: NOTE },
    { action: 'Презентация', count: 3 },
];

const fgOf = (fill: unknown): string | undefined =>
    (fill as FillPattern | undefined)?.fgColor?.argb;

describe('excel-plan-columns.util', () => {
    it('hasPlanColumns: истина, если хоть у одной строки есть плановая колонка', () => {
        expect(hasPlanColumns([{ kpi: KPIS }])).toBe(true);
        expect(hasPlanColumns([{ kpi: [KPIS[0], KPIS[2]] }])).toBe(false);
        expect(hasPlanColumns([])).toBe(false);
    });

    it('kpiCellValue: план без значения — «—», остальное как пришло', () => {
        expect(kpiCellValue(KPIS[1])).toBe(PLAN_EMPTY_VALUE);
        expect(kpiCellValue({ kind: 'plan', count: undefined })).toBe(
            PLAN_EMPTY_VALUE,
        );
        expect(kpiCellValue({ kind: 'plan', count: 0 })).toBe(0);
        expect(kpiCellValue(KPIS[0])).toBe(5);
        expect(kpiCellValue({ count: null })).toBeNull();
    });

    it('planSubRowsOf: строки «— план» отключаются, если план уже колонками', () => {
        const planRows = [{ userId: 1 }];
        expect(planSubRowsOf([{ kpi: KPIS }], planRows)).toBeUndefined();
        expect(planSubRowsOf([{ kpi: [KPIS[0]] }], planRows)).toBe(planRows);
        expect(planSubRowsOf([{ kpi: [KPIS[0]] }], undefined)).toBeUndefined();
    });

    it('ratingColumns: плановые колонки пропускаются, место колонки сохраняется', () => {
        expect(ratingColumns(KPIS)).toEqual([
            { action: 'Звонок', index: 0 },
            { action: 'Презентация', index: 2 },
        ]);
    });

    it('шапка: заметка только у плановой колонки, стиль не трогается', () => {
        const sheet = new Workbook().addWorksheet('Лист');
        const head = sheet.addRow(['ФИО', ...KPIS.map(kpi => kpi.action)]);

        applyPlanHeadNotes(head, KPIS);

        expect(head.getCell(3).note).toBe(NOTE);
        expect(head.getCell(2).note).toBeUndefined();
        expect(head.getCell(4).note).toBeUndefined();
        expect(head.getCell(3).fill).toBeUndefined();
    });

    it('ячейки: плановая заливка только у плановой колонки, «—» прижат вправо', () => {
        const sheet = new Workbook().addWorksheet('Лист');
        const row = sheet.addRow(['Иванов', ...KPIS.map(kpiCellValue)]);

        fillPlanCells(row, KPIS);

        expect(fgOf(row.getCell(3).fill)).toBe(PLAN_FILL_ARGB);
        expect(row.getCell(3).value).toBe(PLAN_EMPTY_VALUE);
        expect(row.getCell(3).alignment?.horizontal).toBe('right');
        expect(row.getCell(2).fill).toBeUndefined();
        expect(row.getCell(4).fill).toBeUndefined();
        expect(row.getCell(1).fill).toBeUndefined();
    });
});
