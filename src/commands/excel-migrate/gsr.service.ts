import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';

@Injectable()
export class GsrParseService {
    constructor() { }

    async parseExcel(filePath: string) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const sheet = workbook.worksheets[0];

        const data: any[] = [];
        let currentCompany = {
            id: null as string | null,
            company: '' as string,
            // kit: '' as string,
            contacts: [] as { name: string, position: string, communicationsRate: string, phone: string, email: string }[],
            complects: [] as { id: string, name: string }[],
            document: '' as string,
            payinfo: '' as string,
            complectInfo: '' as string,
            concurent: '' as string,
            supplyDate: '' as string,
        };

        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Пропускаем заголовок

            const [
                idCell,
                complectId,
                complectName,

                companyCell,
                documentCell,
                communicationsRateCell,
                // kitCell,
                contactNameCell,
                positionCell,
                phoneCell,
                emailCell,

                payinfoCell,
                complectInfoCell,
                concurentCell,
                supplyDateCell

            ] = [
                    row.getCell(1).value, //id
                    row.getCell(2).value, //complectId
                    row.getCell(3).value, //complectName
                    row.getCell(4).value, //company
                    row.getCell(5).value, //document
                    row.getCell(6).value, //communicationsRate

                    row.getCell(7).value, //name
                    row.getCell(8).value, //position
                    row.getCell(9).value, //contactinfo
                    row.getCell(10).value, //email
                    row.getCell(11).value, //payinfo
                    row.getCell(12).value, //complectInfo
                    row.getCell(13).value, //concurent
                    row.getCell(14).value, //supplyDate


                ];

            if (idCell) {
                // новая компания
                if (currentCompany) data.push(currentCompany);
                currentCompany = {
                    id: idCell.toString() as string,
                    company: companyCell?.toString().trim() as string,
                    document: documentCell?.toString().trim() as string,
                    
                    // kit: kitCell?.toString().trim() as string,
                    payinfo: payinfoCell?.toString().trim() as string,
                    complectInfo: complectInfoCell?.toString().trim() as string,
                    concurent: concurentCell?.toString().trim() as string,
                    supplyDate: this.parseDate(supplyDateCell as string | Date | number) as string,
                    contacts: [],
                    complects: [],
                };
            }

            // добавляем комплект
            if (complectId || complectName) {
                currentCompany.complects.push({
                    id: complectId?.toString().trim() as string,
                    name: complectName?.toString().trim() as string,

                });
            }

            // добавляем контакт
            if (contactNameCell || emailCell || phoneCell) {
                currentCompany.contacts.push({
                    name: contactNameCell?.toString().trim() as string,
                    position: positionCell?.toString().trim() as string,
                    phone: phoneCell?.toString().trim() as string,
                    email: emailCell?.toString().trim() as string,
                    communicationsRate: communicationsRateCell?.toString().trim() as string,
                });
            }
        });
        Logger.log(currentCompany)
        if (currentCompany.id) data.push(currentCompany);

        fs.unlinkSync(filePath); // очищаем за собой
        return data;

    }

    private parseDate(supplyDateCell: string | Date | number) {
        let supplyDate = '';
        if (supplyDateCell instanceof Date) {
            supplyDate = dayjs(supplyDateCell).format('YYYY-MM-DD');
        } else if (typeof supplyDateCell === 'number') {
            supplyDate = dayjs(new Date((supplyDateCell - 25569) * 86400 * 1000)).format('YYYY-MM-DD');
        } else if (typeof supplyDateCell === 'string') {
            const parsed = dayjs(supplyDateCell);
            supplyDate = parsed.isValid() ? parsed.format('YYYY-MM-DD') : '';
        }
        return supplyDate;
    }
}