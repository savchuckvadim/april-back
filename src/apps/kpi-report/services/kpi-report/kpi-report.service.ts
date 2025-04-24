import { Injectable, Logger } from '@nestjs/common';
import { Row, Workbook, Worksheet } from 'exceljs';
import { KpiReportDto } from '../../dto/kpi.dto';
import { Buffer } from 'buffer';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

@Injectable()
export class ExcelReportService {
  private readonly logger = new Logger(ExcelReportService.name);


  async generateExcel(dto: KpiReportDto): Promise<Buffer> {
    try {
      const workbook: Workbook = new Workbook();
      const worksheet: Worksheet = workbook.addWorksheet('KPI Отчет');
      this.getDate(dto, worksheet);

      // Пропускаем строку
      worksheet.addRow([]);
      this.getHeads(dto, worksheet);
      this.getValues(dto, worksheet);
      this.addTotalRow(dto, worksheet)
      return Buffer.from(await workbook.xlsx.writeBuffer());
    } catch (error) {
      this.logger.error('Error generating KPI report', error);
      throw error;
    }
  }

  private getDate(dto: KpiReportDto, worksheet: Worksheet): void {


    const from = new Date(dto.date.from);
    const to = new Date(dto.date.to);

    const formattedFrom = format(from, 'd MMMM yyyy', { locale: ru });
    const formattedTo = format(to, 'd MMMM yyyy', { locale: ru });

    worksheet.addRow([`Период: ${formattedFrom} – ${formattedTo}`]);
    worksheet.mergeCells('A1:D1');

    const cell = worksheet.getCell('A1');
    cell.font = { bold: true, size: 14 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDDDDDD' },
    };
  }

  private getHeads(dto: KpiReportDto, worksheet: Worksheet): void {
    const heads = dto.report[0].kpi.map(kpi => kpi.action.name);
    heads.unshift('ФИО');
    const row = worksheet.addRow(heads);

    worksheet.columns = heads.map(() => ({
      width: 22,

    }));

    row.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF000000' }, // чёрный фон
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
  }

  private getHeadsRowStyle(row: Row): void {
    row.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF000000' }, // чёрный фон
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
  }

  private getValues(dto: KpiReportDto, worksheet: Worksheet): void {
    dto.report.forEach((reportItem, index) => {
      const userName = reportItem.userName || `${reportItem.user?.LAST_NAME || ''} ${reportItem.user?.NAME || ''}`.trim();
      const values = reportItem.kpi.map(kpiItem => kpiItem.count);
      worksheet.addRow([userName, ...values]);

      const cell = worksheet.getCell(`A${index + 4}`);
      cell.font = { bold: true, size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFDDDDDD' },
      };


    });
  }

  private addTotalRow(dto: KpiReportDto, worksheet: Worksheet): void {
    const heads = dto.report[0].kpi.map(kpi => kpi.action.name);
    const kpiCount = heads.length;

    // Инициализируем массив из нулей для суммы
    const totals = Array(kpiCount).fill(0);

    // Суммируем значения по каждому KPI
    dto.report.forEach(reportItem => {
      reportItem.kpi.forEach((kpiItem, index) => {
        totals[index] += kpiItem.count ?? 0;
      });
    });

    // Добавляем строку "Итого"
    const totalRow = ['Итого', ...totals];
    const row = worksheet.addRow(totalRow);

    // Стили для строки "Итого"
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

  private styleRow(row: Row, isHeader = false) {
    row.eachCell((cell, colNumber) => {
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      if (isHeader) {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF000000' },
        };
      } else if (colNumber === 1) {
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFEEEEEE' },
        };
      }
    });
  }

}
