import { Injectable, Logger } from '@nestjs/common';
import { Row, Workbook, Worksheet } from 'exceljs';
import { KpiReportDto } from '../dto/kpi.dto';
import { Buffer } from 'buffer';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

@Injectable()
export class ExcelReportService {
  private readonly logger = new Logger(ExcelReportService.name);
  private workbook: Workbook = new Workbook();
  private worksheet: Worksheet = this.workbook.addWorksheet('KPI Отчет');

  async generateExcel(dto: KpiReportDto): Promise<Buffer> {
    try {
      this.getDate(dto);

      // Пропускаем строку
      this.worksheet.addRow([]);
      this.getHeads(dto);
      this.getValues(dto);

      return Buffer.from(await this.workbook.xlsx.writeBuffer());
    } catch (error) {
      this.logger.error('Error generating KPI report', error);
      throw error;
    }
  }

  private getDate(dto: KpiReportDto): void {


    const from = new Date(dto.date.from);
    const to = new Date(dto.date.to);

    const formattedFrom = format(from, 'd MMMM yyyy', { locale: ru });
    const formattedTo = format(to, 'd MMMM yyyy', { locale: ru });

    this.worksheet.addRow([`Период: ${formattedFrom} – ${formattedTo}`]);
    this.worksheet.mergeCells('A1:G1');

    const cell = this.worksheet.getCell('A1');
    cell.font = { bold: true, size: 14 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDDDDDD' },
    };
  }

  private getHeads(dto: KpiReportDto): void {
    const heads = dto.report[0].kpi.map(kpi => kpi.action.name);
    heads.unshift('ФИО');
    const row = this.worksheet.addRow(heads);

    this.worksheet.columns = heads.map(() => ({
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

  private getValues(dto: KpiReportDto): void {
    dto.report.forEach((reportItem, index) => {
      const userName = reportItem.userName || `${reportItem.user?.LAST_NAME || ''} ${reportItem.user?.NAME || ''}`.trim();
      const values = reportItem.kpi.map(kpiItem => kpiItem.count);
      this.worksheet.addRow([userName, ...values]);

      const cell = this.worksheet.getCell(`A${index + 4}`);
      cell.font = { bold: true, size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFDDDDDD' },
      };

    
    });
  }
}
