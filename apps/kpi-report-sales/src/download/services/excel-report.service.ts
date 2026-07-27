import { Injectable, Logger } from '@nestjs/common';
import { Row, Workbook, Worksheet } from 'exceljs';
import {
    ConversionsExcelDto,
    DownLoadKpiReportDto as KpiReportDto,
    DownloadKpiReportItemDto,
    PlanMainRowDto,
    PlansExcelCellDto,
    PlansExcelDto,
    PlansExcelRowDto,
    ReportStructureDepartmentDto,
} from '../dto/get-excel-report.dto';
import { Buffer } from 'buffer';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

/** Мягкая заливка плановых строк/колонок (голубая, читаема при печати). */
const PLAN_FILL_ARGB = 'FFDCE9F7';
/** numFmt достижения плана (доля 0.84 → 84,0%). */
const PLAN_PERCENT_FORMAT = '0.0%';
/** numFmt денежных показателей листа «Планы». */
const PLAN_MONEY_FORMAT = '#,##0';

/**
 * Генерация Excel KPI-отчёта.
 * Без structure — прежний одиночный лист (обратная совместимость).
 * С structure: лист «Сводный»; мульти — дополнительно лист на каждый ОП
 * с секциями групп и итогами; моно с группами — лист «По группам».
 */
@Injectable()
export class ExcelReportService {
    private readonly logger = new Logger(ExcelReportService.name);

    async generateExcel(dto: KpiReportDto): Promise<Buffer> {
        try {
            const workbook: Workbook = new Workbook();

            const summary = workbook.addWorksheet(
                dto.structure ? 'Сводный' : 'KPI Отчет',
            );
            this.renderDateHeader(dto, summary);
            summary.addRow([]);
            this.renderReportBlock(
                summary,
                dto.report,
                null,
                'Итого',
                dto.plans?.mainRows,
            );
            this.setColumnWidths(summary, dto.report);

            const departments = dto.structure?.departments ?? [];
            if (dto.structure && departments.length) {
                if (dto.structure.isMultiple) {
                    for (const department of departments) {
                        this.renderDepartmentSheet(workbook, dto, department);
                    }
                } else if (departments.some(dep => dep.groups.length > 0)) {
                    const sheet = workbook.addWorksheet('По группам');
                    this.renderDateHeader(dto, sheet);
                    sheet.addRow([]);
                    for (const department of departments) {
                        this.renderDepartmentSections(sheet, dto, department);
                    }
                    this.setColumnWidths(sheet, dto.report);
                }
            }

            this.renderRatingSheets(workbook, dto);

            if (dto.conversions?.columns?.length) {
                this.renderConversionsSheet(workbook, dto, dto.conversions);
            }

            if (dto.plans?.columns?.length) {
                this.renderPlansSheet(workbook, dto, dto.plans);
            }

            return Buffer.from(await workbook.xlsx.writeBuffer());
        } catch (error) {
            this.logger.error('Error generating KPI report', error);
            throw error;
        }
    }

    /** Лист отдела: секции групп + «Без группы» + итог по отделу. */
    private renderDepartmentSheet(
        workbook: Workbook,
        dto: KpiReportDto,
        department: ReportStructureDepartmentDto,
    ): void {
        const sheet = workbook.addWorksheet(
            this.sanitizeSheetName(department.name),
        );
        this.renderDateHeader(dto, sheet);
        sheet.addRow([]);
        this.renderDepartmentSections(sheet, dto, department);
        this.setColumnWidths(sheet, dto.report);
    }

    private renderDepartmentSections(
        sheet: Worksheet,
        dto: KpiReportDto,
        department: ReportStructureDepartmentDto,
    ): void {
        const departmentRows: DownloadKpiReportItemDto[] = [];
        const planRows = dto.plans?.mainRows;

        for (const group of department.groups) {
            const rows = this.rowsByIds(dto.report, group.userIds);
            if (!rows.length) continue;
            departmentRows.push(...rows);
            this.renderReportBlock(
                sheet,
                rows,
                group.name,
                'Итого по группе',
                planRows,
            );
        }

        const directRows = this.rowsByIds(dto.report, department.userIds);
        if (directRows.length) {
            departmentRows.push(...directRows);
            this.renderReportBlock(
                sheet,
                directRows,
                department.groups.length ? 'Без группы' : department.name,
                'Итого',
                planRows,
            );
        }

        if (departmentRows.length && department.groups.length) {
            this.renderTotalRow(
                sheet,
                departmentRows,
                `Итого по отделу «${department.name}»`,
            );
            sheet.addRow([]);
        }
    }

    /** Блок: [заголовок секции] + шапка + строки (+ подстроки «— план») + итог. */
    private renderReportBlock(
        sheet: Worksheet,
        rows: DownloadKpiReportItemDto[],
        title: string | null,
        totalLabel: string,
        planRows?: PlanMainRowDto[],
    ): void {
        if (!rows.length) return;

        if (title) {
            const titleRow = sheet.addRow([title]);
            titleRow.font = { bold: true, size: 12 };
            titleRow.getCell(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFDDDDDD' },
            };
        }

        const heads = rows[0].kpi.map(kpi => kpi.action);
        const headRow = sheet.addRow(['ФИО', ...heads]);
        this.styleHeadRow(headRow);

        for (const item of rows) {
            const row = sheet.addRow([
                item.userName,
                ...item.kpi.map(kpi => kpi.count),
            ]);
            const nameCell = row.getCell(1);
            nameCell.font = { bold: true, size: 10 };
            nameCell.alignment = { vertical: 'middle', horizontal: 'left' };
            nameCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFDDDDDD' },
            };
            this.renderPlanSubRow(sheet, item, planRows);
        }

        this.renderTotalRow(sheet, rows, totalLabel);
        sheet.addRow([]);
    }

    /**
     * Подстрока «— план» под строкой сотрудника: планы руководителя по
     * колонкам показателей (голубая заливка). Нет планов — строки нет.
     */
    private renderPlanSubRow(
        sheet: Worksheet,
        item: DownloadKpiReportItemDto,
        planRows?: PlanMainRowDto[],
    ): void {
        const userPlans = planRows?.find(plan => plan.userId === item.id);
        if (!userPlans?.cells.length) return;

        const planByCode = new Map(
            userPlans.cells.map(cell => [cell.code, cell.plan]),
        );
        const hasAny = item.kpi.some(
            kpi => kpi.id && planByCode.has(kpi.id),
        );
        if (!hasAny) return;

        const row = sheet.addRow([
            '— план',
            ...item.kpi.map(kpi =>
                kpi.id && planByCode.has(kpi.id) ? planByCode.get(kpi.id) : '',
            ),
        ]);
        row.font = { italic: true, size: 9 };
        row.alignment = { vertical: 'middle', horizontal: 'right' };
        row.eachCell(cell => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: PLAN_FILL_ARGB },
            };
        });
    }

    private renderTotalRow(
        sheet: Worksheet,
        rows: DownloadKpiReportItemDto[],
        label: string,
    ): void {
        const kpiCount = rows[0]?.kpi.length ?? 0;
        const totals: number[] = new Array<number>(kpiCount).fill(0);
        rows.forEach(item => {
            item.kpi.forEach((kpi, index) => {
                totals[index] += kpi.count ?? 0;
            });
        });

        const row = sheet.addRow([label, ...totals]);
        row.font = { bold: true };
        row.alignment = { vertical: 'middle', horizontal: 'right' };
        row.eachCell(cell => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFEEEEEE' },
            };
        });
    }

    private renderDateHeader(dto: KpiReportDto, sheet: Worksheet): void {
        const from = new Date(dto.date.from);
        const to = new Date(dto.date.to);

        const formattedFrom = format(from, 'd MMMM yyyy', { locale: ru });
        const formattedTo = format(to, 'd MMMM yyyy', { locale: ru });

        sheet.addRow([`Период: ${formattedFrom} – ${formattedTo}`]);
        sheet.mergeCells('A1:D1');

        const cell = sheet.getCell('A1');
        cell.font = { bold: true, size: 14 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFDDDDDD' },
        };
    }

    private styleHeadRow(row: Row): void {
        row.eachCell(cell => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF000000' },
            };
            cell.alignment = {
                horizontal: 'center',
                vertical: 'middle',
                wrapText: true,
            };
        });
    }

    private setColumnWidths(
        sheet: Worksheet,
        rows: DownloadKpiReportItemDto[],
    ): void {
        const kpiCount = rows[0]?.kpi.length ?? 0;
        sheet.columns = new Array(kpiCount + 1).fill(null).map(() => ({
            width: 22,
        }));
    }

    /**
     * Листы рейтингов-победителей по каждому показателю отчёта (в отчёт
     * попадают только действия из фильтра пользователя): «Рейтинг —
     * Сотрудники» всегда; «— Группы» / «— Отделы» — при наличии структуры.
     */
    private renderRatingSheets(workbook: Workbook, dto: KpiReportDto): void {
        if (!dto.report.length) return;
        const actions = dto.report[0].kpi.map(kpi => kpi.action);

        this.renderRatingSheet(
            workbook,
            dto,
            'Рейтинг — Сотрудники',
            actions.map((action, index) => ({
                action,
                rows: dto.report
                    .map(item => ({
                        name: item.userName,
                        value: item.kpi[index]?.count ?? 0,
                    }))
                    .sort((a, b) => b.value - a.value),
            })),
        );

        const structure = dto.structure;
        if (!structure?.departments?.length) return;

        const groupRatings = actions.map((action, index) => ({
            action,
            rows: structure.departments
                .flatMap(dep =>
                    dep.groups.map(group => ({
                        name: structure.isMultiple
                            ? `${dep.name} — ${group.name}`
                            : group.name,
                        value: this.sumActionByUsers(
                            dto.report,
                            index,
                            group.userIds,
                        ),
                    })),
                )
                .sort((a, b) => b.value - a.value),
        }));
        if (groupRatings.some(rating => rating.rows.length > 1)) {
            this.renderRatingSheet(
                workbook,
                dto,
                'Рейтинг — Группы',
                groupRatings,
            );
        }

        if (structure.departments.length > 1) {
            const departmentRatings = actions.map((action, index) => ({
                action,
                rows: structure.departments
                    .map(dep => ({
                        name: dep.name,
                        value: this.sumActionByUsers(dto.report, index, [
                            ...dep.userIds,
                            ...dep.groups.flatMap(group => group.userIds),
                        ]),
                    }))
                    .sort((a, b) => b.value - a.value),
            }));
            this.renderRatingSheet(
                workbook,
                dto,
                'Рейтинг — Отделы',
                departmentRatings,
            );
        }
    }

    private renderRatingSheet(
        workbook: Workbook,
        dto: KpiReportDto,
        name: string,
        ratings: {
            action: string;
            rows: { name: string; value: number }[];
        }[],
    ): void {
        const sheet = workbook.addWorksheet(this.sanitizeSheetName(name));
        this.renderDateHeader(dto, sheet);
        sheet.addRow([]);
        sheet.columns = [{ width: 8 }, { width: 36 }, { width: 14 }];

        for (const rating of ratings) {
            if (!rating.rows.length) continue;

            const titleRow = sheet.addRow([rating.action]);
            titleRow.font = { bold: true, size: 12 };
            titleRow.getCell(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFDDDDDD' },
            };

            const headRow = sheet.addRow(['Место', 'Название', 'Значение']);
            this.styleHeadRow(headRow);

            rating.rows.forEach((row, index) => {
                const dataRow = sheet.addRow([index + 1, row.name, row.value]);
                if (index === 0) {
                    // победитель
                    dataRow.font = { bold: true };
                    dataRow.eachCell(cell => {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFF5E6B8' },
                        };
                    });
                }
            });
            sheet.addRow([]);
        }
    }

    /**
     * Лист «Конверсии»: % между показателями (считает фронт, здесь только
     * рендер). Доли пишутся числом с форматом 0.0%, null → «—».
     */
    private renderConversionsSheet(
        workbook: Workbook,
        dto: KpiReportDto,
        conversions: ConversionsExcelDto,
    ): void {
        const sheet = workbook.addWorksheet(
            this.sanitizeSheetName('Конверсии'),
        );
        this.renderDateHeader(dto, sheet);
        sheet.addRow([]);

        if (conversions.reportTypeLabel) {
            const typeRow = sheet.addRow([
                `Тип отчёта: ${conversions.reportTypeLabel}`,
            ]);
            typeRow.font = { bold: true, size: 12 };
        }
        const methodRow = sheet.addRow([
            `Способ расчёта: ${conversions.methodLabel}`,
        ]);
        methodRow.font = { bold: true, size: 12 };
        sheet.addRow([]);

        const headRow = sheet.addRow(['ФИО', ...conversions.columns]);
        this.styleHeadRow(headRow);

        const writePercentCells = (row: Row, values: (number | null)[]) => {
            values.forEach((value, index) => {
                const cell = row.getCell(index + 2);
                if (value === null || value === undefined) {
                    cell.value = '—';
                    cell.alignment = {
                        vertical: 'middle',
                        horizontal: 'right',
                    };
                } else {
                    cell.value = value;
                    cell.numFmt = '0.0%';
                }
            });
        };

        const writeRowsBlock = (
            rows: ConversionsExcelDto['rows'],
            total: (number | null)[],
            totalLabel: string,
        ) => {
            for (const item of rows) {
                const row = sheet.addRow([item.userName]);
                const nameCell = row.getCell(1);
                nameCell.font = { bold: true, size: 10 };
                nameCell.alignment = {
                    vertical: 'middle',
                    horizontal: 'left',
                };
                nameCell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFDDDDDD' },
                };
                writePercentCells(row, item.values);
            }

            const totalRow = sheet.addRow([totalLabel]);
            totalRow.font = { bold: true };
            writePercentCells(totalRow, total);
            totalRow.eachCell(cell => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFEEEEEE' },
                };
            });
        };

        writeRowsBlock(conversions.rows, conversions.total, 'Итого');

        // Разбивка по отделам/группам (как на KPI-листах): заголовок секции
        // + свой «Итого» из сумм числителей/знаменателей (считает фронт).
        for (const section of conversions.sections ?? []) {
            if (!section.rows.length) continue;
            sheet.addRow([]);
            const titleRow = sheet.addRow([section.title]);
            titleRow.font = { bold: true, size: 12 };
            titleRow.getCell(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFBFBFBF' },
            };
            const sectionHead = sheet.addRow(['ФИО', ...conversions.columns]);
            this.styleHeadRow(sectionHead);
            writeRowsBlock(section.rows, section.total, 'Итого по секции');
        }

        sheet.columns = new Array(conversions.columns.length + 1)
            .fill(null)
            .map((_item, index) => ({ width: index === 0 ? 28 : 26 }));
    }

    /**
     * Лист «Планы»: по каждому включённому показателю три колонки
     * (план / факт / %). План пересчитан фронтом на выбранный период;
     * рядовой сотрудник получает только свою строку (фильтрует фронт).
     */
    private renderPlansSheet(
        workbook: Workbook,
        dto: KpiReportDto,
        plans: PlansExcelDto,
    ): void {
        const sheet = workbook.addWorksheet(this.sanitizeSheetName('Планы'));
        this.renderDateHeader(dto, sheet);
        sheet.addRow([]);

        const headCells = plans.columns.flatMap(name => [
            `${name} — план`,
            `${name} — факт`,
            `${name} — %`,
        ]);
        const headRow = sheet.addRow(['ФИО', ...headCells]);
        this.styleHeadRow(headRow);
        // План-колонки подсвечены (та же заливка, что подстроки «— план»).
        headRow.eachCell((cell, colNumber) => {
            if (colNumber > 1 && (colNumber - 2) % 3 === 0) {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: PLAN_FILL_ARGB },
                };
                cell.font = { bold: true };
            }
        });

        const writeCells = (row: Row, cells: PlansExcelCellDto[]) => {
            cells.forEach((cell, index) => {
                const base = 2 + index * 3;
                const unit = plans.units[index];
                const moneyFmt = unit === 'money' ? PLAN_MONEY_FORMAT : undefined;

                const planCell = row.getCell(base);
                if (cell.plan === null) {
                    planCell.value = '—';
                    planCell.alignment = {
                        vertical: 'middle',
                        horizontal: 'right',
                    };
                } else {
                    planCell.value = cell.plan;
                    if (moneyFmt) planCell.numFmt = moneyFmt;
                }
                planCell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: PLAN_FILL_ARGB },
                };

                const factCell = row.getCell(base + 1);
                factCell.value = cell.fact;
                if (moneyFmt) factCell.numFmt = moneyFmt;

                const percentCell = row.getCell(base + 2);
                if (cell.percent === null) {
                    percentCell.value = '—';
                    percentCell.alignment = {
                        vertical: 'middle',
                        horizontal: 'right',
                    };
                } else {
                    percentCell.value = cell.percent;
                    percentCell.numFmt = PLAN_PERCENT_FORMAT;
                }
            });
        };

        const writeRowsBlock = (
            rows: PlansExcelRowDto[],
            total: PlansExcelCellDto[],
            totalLabel: string,
        ) => {
            for (const item of rows) {
                const row = sheet.addRow([item.userName]);
                const nameCell = row.getCell(1);
                nameCell.font = { bold: true, size: 10 };
                nameCell.alignment = {
                    vertical: 'middle',
                    horizontal: 'left',
                };
                nameCell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFDDDDDD' },
                };
                writeCells(row, item.cells);
            }

            const totalRow = sheet.addRow([totalLabel]);
            totalRow.font = { bold: true };
            writeCells(totalRow, total);
            totalRow.getCell(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFEEEEEE' },
            };
        };

        writeRowsBlock(plans.rows, plans.total, 'Итого');

        for (const section of plans.sections ?? []) {
            if (!section.rows.length) continue;
            sheet.addRow([]);
            const titleRow = sheet.addRow([section.title]);
            titleRow.font = { bold: true, size: 12 };
            titleRow.getCell(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFBFBFBF' },
            };
            const sectionHead = sheet.addRow(['ФИО', ...headCells]);
            this.styleHeadRow(sectionHead);
            writeRowsBlock(section.rows, section.total, 'Итого по секции');
        }

        sheet.columns = new Array(headCells.length + 1)
            .fill(null)
            .map((_item, index) => ({ width: index === 0 ? 28 : 18 }));
    }

    private sumActionByUsers(
        report: DownloadKpiReportItemDto[],
        actionIndex: number,
        userIds: number[],
    ): number {
        const ids = new Set(userIds.map(Number));
        return report
            .filter(item => ids.has(Number(item.id)))
            .reduce(
                (sum, item) => sum + (item.kpi[actionIndex]?.count ?? 0),
                0,
            );
    }

    private rowsByIds(
        report: DownloadKpiReportItemDto[],
        userIds: number[],
    ): DownloadKpiReportItemDto[] {
        const ids = new Set(userIds.map(Number));
        return report.filter(item => ids.has(Number(item.id)));
    }

    /** Имя листа Excel: ≤31 символа, без запрещённых символов. */
    private sanitizeSheetName(name: string): string {
        const cleaned = name.replace(/[\\/?*[\]:]/g, ' ').trim() || 'Отдел';
        return cleaned.slice(0, 31);
    }
}
