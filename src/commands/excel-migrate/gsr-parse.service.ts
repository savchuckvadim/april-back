import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import { Contact, MigrateToBxDto, Product } from './dto/migrate-to-bx.dto';




@Injectable()
export class GsrParseService {
    constructor() { }

    async parseExcel(filePath: string): Promise<MigrateToBxDto[]> {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const sheet = workbook.worksheets[0];

        const data: MigrateToBxDto[] = [];
        let currentCompany = {
            id: null as string | null,
            company: '' as string,
            // kit: '' as string,
            products: [] as Product[],
            contacts: [] as Contact[],
            contract: {

            } as {
                contractEndDate: string,
                contractType: string,
                contractPrepayment: string
            },
            document: '' as string,
            payinfo: '' as string,
            complectInfo: '' as string,
            concurent: '' as string,
            supplyDate: '' as string,
        } as MigrateToBxDto;

        sheet.eachRow((row, rowNumber) => {
            // if (rowNumber === 1) return; // Пропускаем заголовок

            const [
                idCell,
                complectId,
                complectName,

                monthSumCell,
                contractPrepaymentCell,
                // contractLongCell,
                contractEndDateCell,
                contractTypeCell,
                quantityStringCell,

                // company
                companyCell,
                documentCell,
                communicationsRateCell,
                // kitCell,

                // product


                // contact
                contactNameCell,
                positionCell,
                phoneCell,
                emailCell,

                payinfoCell,
                complectInfoCell,
                concurentCell,
                supplyDateCell,
                contactFirstEduCell, //Вводное Обучение дата/ менеджер обучивший
                contactFirstEduCommentCell, //Комментарий (что дали, чему обучили)
                contactEduCell, //Вводное Обучение дата/ менеджер обучивший
                contactEduCommentCell, //Комментарий (что дали, чему обучили)
                contactExaminationCell, //Проверка
                contactQualificationCell, //Звонок качества
                contactSkap,
                conmtactGl,
                contactGarantClub

            ] = [
                    row.getCell(1).value, //id
                    row.getCell(2).value, //complectId
                    row.getCell(3).value, //complectName

                    row.getCell(4).value, //month sum
                    row.getCell(5).value, //contract prepayment 

                    // row.getCell(6).value, //contract long
                    row.getCell(6).value, //contract end date

                    row.getCell(7).value, //contract type
                    row.getCell(8).value, //quantity string




                    row.getCell(9).value, //company
                    row.getCell(10).value, //document
                    row.getCell(11).value, //communicationsRate


                    row.getCell(12).value, //contact name
                    row.getCell(13).value, //position
                    row.getCell(14).value, //contactinfo
                    row.getCell(15).value, //email
                    row.getCell(16).value, //payinfo
                    row.getCell(17).value, //complectInfo
                    row.getCell(18).value, //concurent
                    row.getCell(19).value, //supplyDate

                    row.getCell(20).value, //contactFirstEdu
                    row.getCell(21).value, //contactFirstEduComment
                    row.getCell(22).value, //contactEdu
                    row.getCell(23).value, //contactEduComment
                    row.getCell(24).value, //contactExamination
                    row.getCell(25).value, //contactQualification
                    row.getCell(26).value, //contactSkap
                    row.getCell(27).value, //conmtactGl
                    row.getCell(28).value, //contactGarantClub



                ];

            if (idCell) {
                // новая компания
                if (currentCompany) data.push(currentCompany);
                currentCompany = {
                    id: idCell.toString() || '' as string,


                    company: companyCell?.toString().trim() || '' as string,
                    document: documentCell?.toString().trim() || '' as string,

                    // kit: kitCell?.toString().trim() as string,
                    payinfo: payinfoCell?.toString().trim() || '' as string,
                    complectInfo: complectInfoCell?.toString().trim() || '' as string,
                    concurent: concurentCell?.toString().trim() || '' as string,
                    supplyDate: this.parseDate(supplyDateCell as string | Date | number) || '' as string,
                    contacts: [],
                    contract: {
                        contractEndDate: '',
                        contractType: '',
                        contractPrepayment: '',
                    },
                    products: [],
                };
            }

            // // добавляем комплект
            // if (complectId || complectName) {
            //     currentCompany.complects.push({
            //         id: complectId?.toString().trim() as string,
            //         name: complectName?.toString().trim() as string,

            //     });
            // }

            // добавляем контакт
            if (contactNameCell || emailCell || phoneCell) {
                currentCompany.contacts.push({
                    name: contactNameCell?.toString().trim() || '' as string,
                    position: positionCell?.toString().trim() || '' as string,
                    phone: phoneCell?.toString().trim() || '' as string,
                    email: emailCell?.toString().trim() || '' as string,
                    communicationsRate: communicationsRateCell?.toString().trim() || '' as string,
                    contactFirstEdu: contactFirstEduCell?.toString().trim() || '' as string,
                    contactFirstEduComment: contactFirstEduCommentCell?.toString().trim() || '' as string,
                    contactEdu: contactEduCell?.toString().trim() || '' as string,
                    contactEduComment: contactEduCommentCell?.toString().trim() || '' as string,
                    contactExamination: contactExaminationCell?.toString().trim() || '' as string,
                    contactQualification: contactQualificationCell?.toString().trim() || '' as string,
                    contactSkap: contactSkap?.toString().trim() || '' as string,
                    conmtactGl: conmtactGl?.toString().trim() || '' as string,
                    contactGarantClub: contactGarantClub?.toString().trim() || '' as string,


                });
            }

            // добавляем продукт
            if (complectName) {
                currentCompany.products.push({
                    name: complectName?.toString().trim() as string,
                    quantity: quantityStringCell ? Number(this.parseQuantity(quantityStringCell?.toString().trim())) : 1 as number,
                    monthSum: monthSumCell ? this.trimLast3IfDash(monthSumCell.toString()).trim() : '0' as string,
                    armId: `${complectId?.toString().trim()} - ${complectName?.toString().trim()}` as string,

                });
            }

            // добавляем договор
            if (contractEndDateCell && contractTypeCell && contractPrepaymentCell) {
                currentCompany.contract = {
                    contractEndDate: this.parseDate(contractEndDateCell as string | Date | number, true) as string,
                    contractType: contractTypeCell?.toString().trim() || '' as string,
                    contractPrepayment: contractPrepaymentCell?.toString().trim() || '' as string,
                };
            }
        });

        if (currentCompany.id) data.push(currentCompany);

        fs.unlinkSync(filePath); // очищаем за собой
        const result = data.map(company => {


            return {
                ...company,

                products: this.getProductsWithQuantity(company.products)
            }
        })
        return result;

    }
    private trimLast3IfDash(str: string): string {
        return str.replace(/-\w{2}$/, '');
    }
    private parseDate(supplyDateCell: string | Date | number, isContractEnd?: boolean) {
        let supplyDate = '';

        if (!supplyDateCell) {
            return supplyDate;
        }

        if (supplyDateCell instanceof Date) {
            supplyDate = dayjs(supplyDateCell).format('YYYY-MM-DD');
        } else if (typeof supplyDateCell === 'number') {
            supplyDate = dayjs(new Date((supplyDateCell - 25569) * 86400 * 1000)).format('YYYY-MM-DD');
        } else if (typeof supplyDateCell === 'string') {
            // Remove 'г' suffix if present
            const cleanDate = supplyDateCell.replace('г', '').trim();

            // Handle DD.MM.YYYY or DD.MM.YY format
            const parts = cleanDate.split('.');
            if (parts.length === 3) {
                const [day, month, year] = parts;
                // Handle short year format (YY)
                const fullYear = year.length === 2 ? `20${year}` : year;
                try {
                    const date = dayjs(`${fullYear}-${month}-${day}`);
                    if (date.isValid()) {
                        supplyDate = date.format('YYYY-MM-DD');
                    }
                } catch (e) {
                    Logger.warn(`Failed to parse date: ${supplyDateCell}`);
                }
            } else {
                const parsed = dayjs(cleanDate);
                supplyDate = parsed.isValid() ? parsed.format('YYYY-MM-DD') : '';
            }
        }

        !isContractEnd && Logger.log('DateCell', supplyDateCell)
        !isContractEnd && Logger.log(supplyDateCell)
        !isContractEnd && Logger.log('Date', supplyDate)
        !isContractEnd && Logger.log(supplyDate)
        return supplyDate;
    }

    private parseQuantity(quantityStringCell: string): number {
        const match = quantityStringCell.match(/\d+/); // ищет первое число

        if (match) {
            const number = parseInt(match[0], 10);
            return number;
        }
        return 0;
    }

    private getProductsWithQuantity(products: Product[]): Product[] {
        const nonZeroProduct = products.find(
            (p: Product) => Number(p.quantity) > 0
        );

        const sharedQuantity = nonZeroProduct
            ? this.parseQuantity(nonZeroProduct.quantity.toString().trim())
            : 0;

        const resultProducts = products.map((product: Product) => ({
            ...product,
            quantity: sharedQuantity,
            monthSum: product.monthSum
        }));
        return resultProducts;
    }
}