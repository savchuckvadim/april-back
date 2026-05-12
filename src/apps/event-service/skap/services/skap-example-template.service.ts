import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { SKAP_ONLINE_SEMICOLON_HEADERS } from '../lib/skap-online-columns.constants';

/**
 * Пустой пример .xlsx с заголовками столбцов Online.
 */
@Injectable()
export class SkapExampleTemplateService {
    async buildExampleTemplateXlsx(): Promise<Buffer> {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Online', {
            views: [{ state: 'frozen', ySplit: 1 }],
        });
        ws.addRow([...SKAP_ONLINE_SEMICOLON_HEADERS]);
        ws.getRow(1).font = { bold: true };
        const buf = await wb.xlsx.writeBuffer();
        return Buffer.from(buf);
    }
}
