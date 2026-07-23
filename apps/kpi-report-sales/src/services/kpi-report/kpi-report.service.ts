import { Injectable, Logger } from '@nestjs/common';
import { Row, Workbook, Worksheet } from 'exceljs';
import {
    DownLoadKpiReportDto as KpiReportDto,
    DownloadKpiReportItemDto,
    ReportStructureDepartmentDto,
} from '../../dto/get-excel-report.dto';
import { Buffer } from 'buffer';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

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
            this.renderReportBlock(summary, dto.report, null, 'Итого');
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

        for (const group of department.groups) {
            const rows = this.rowsByIds(dto.report, group.userIds);
            if (!rows.length) continue;
            departmentRows.push(...rows);
            this.renderReportBlock(
                sheet,
                rows,
                group.name,
                'Итого по группе',
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

    /** Блок: [заголовок секции] + шапка + строки + итог + пустая строка. */
    private renderReportBlock(
        sheet: Worksheet,
        rows: DownloadKpiReportItemDto[],
        title: string | null,
        totalLabel: string,
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
        }

        this.renderTotalRow(sheet, rows, totalLabel);
        sheet.addRow([]);
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
