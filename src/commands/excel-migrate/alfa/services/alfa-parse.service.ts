import { Injectable, Logger } from '@nestjs/common';

import * as ExcelJS from 'exceljs';
import * as fs from 'fs';



export interface IAlfaParse {
    id: string;
    companyName: string;
    region: string;
    inn: string;
    isWork: number;
}

@Injectable()
export class AlfaParseService {
    constructor() { }

    async parseExcel(filePath: string): Promise<any[]> {

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const sheet = workbook.worksheets[0];

        const data: any[] = [];
        let currentCompany = {
            id: null as string | null,
            companyName: '' as string,
            isWork: 0 as number,

        } as IAlfaParse;

        sheet.eachRow((row, rowNumber) => {

            const [
                id,
                companyName,
                region,
                inn,
                isWork,

            ] = [
                    row.getCell(1).value, //id
                    row.getCell(2).value, //companyName
                    row.getCell(3).value, //region
                    row.getCell(4).value, //inn
                    row.getCell(5).value, //isWork



                ];

            if (companyName) {

                currentCompany = {
                    id: id || '',
                    companyName: companyName || '',
                    region: region || '',
                    inn: inn || '',
                    isWork: isWork === 'Разрешено' ? 1384 : 1386,

                } as IAlfaParse;
                if (currentCompany.companyName) {
                    data.push(currentCompany);
                }
            }





        });
        fs.unlinkSync(filePath); // очищаем за собой
        return data
    }

}