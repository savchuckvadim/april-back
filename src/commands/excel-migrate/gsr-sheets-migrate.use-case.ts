import { GsrBitrixService } from "./gsr-bitrix.service";
import { GsrParseService } from "./gsr-parse.service";
import { Injectable } from "@nestjs/common";
import * as ExcelJS from 'exceljs';

@Injectable()
export class GsrSheetsMigrateUseCase {
    constructor(
        private readonly parseService: GsrParseService,
        // private readonly bitrixService: GsrBitrixService

    ) { }

    async migrate(domain: string, userId: string, filePath: string) {
        return await this.parseSheets(filePath)


        // const result = await this.bitrixService.migrateToBitrix(domain, userId, parsedData);
        // return { count: parsedData.length, result: result, parsedData: parsedData.map(item => ({ supplyDate: item.supplyDate, ...item.contract })) }

    }

    private async parseSheets(filePath: string) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const sheets = workbook.worksheets;
        const data: any[] = [];
        sheets.forEach((sheet, index) => {


            const sheetItem = {
                sheetId: index,
                companyName: sheet.name,
                sheetData: '' as string,
                contacts: [] as any[],
                company: {} as any
            }
            const company = {

                clientName: '',
                address: '',
                complectName: '',
                price: '',
                email: '',
                complectBlocks: '',
                managerName: '',
                contacts: [] as any[]

            }
            sheet.eachRow((row, rowNumber) => {
                if (rowNumber < 8) {




                    const rowData: any[] = Array.isArray(row.values)
                        ? row.values
                            .filter((item, index) => index > 1)

                            .map(item => {
                                if (typeof item === 'object' && item !== null) {
                                    if ('richText' in item && Array.isArray(item.richText)) {
                                        // Собираем все тексты из richText и объединяем в одну строку
                                        return item.richText.map((rt: any) => rt.text).join('');
                                    }
                                    if ('value' in item) return item.value;
                                    if ('text' in item) return item.text;
                                }
                                return item;
                            })
                            .filter(item => item !== null && item !== undefined)
                            .filter((item, idx, arr) => arr.indexOf(item) === idx)
                            .filter(item => typeof item === 'string')
                        : []
                    switch (rowNumber) {
                        case 1:

                            rowData.forEach(item => {
                                company.clientName += item + ' \n'
                            })
                            break;
                        case 2:
                            rowData.forEach(item => {
                                company.address += item + ' \n'
                            })
                            break;
                        case 3:
                            rowData.forEach(item => {
                                company.complectName += item + ' \n'
                            })
                            break;
                        case 4:
                            rowData.forEach(item => {
                                company.price += item + ' \n'
                            })
                            break;
                        case 5:
                            rowData.forEach(item => {
                                company.email += item + ' \n'
                            })
                            break;
                        case 6:
                            rowData.forEach(item => {
                                company.complectBlocks += item + ' \n'
                            })
                            break;
                        case 7:
                            rowData.forEach(item => {
                                company.managerName += item + ' \n'
                            })
                            break;

                    }

                    rowData.forEach(item => {
                        sheetItem.sheetData += item + ' \n'
                    })
                } else {
                    const contact = {
                        name: '',
                        position: '',
                        phone: '',
                        email: '',
                        payinfo: '',
                    }
                    const rowData: any[] = Array.isArray(row.values)
                        ? row.values
                            .map(item => {
                                if (typeof item === 'object' && item !== null) {
                                    if ('richText' in item && Array.isArray(item.richText)) {
                                        // Собираем все тексты из richText и объединяем в одну строку
                                        return item.richText.map((rt: any) => rt.text).join('');
                                    }
                                    if ('value' in item) return item.value;
                                    if ('text' in item) return item.text;
                                }
                                return item;
                            })
                            .filter(item => item !== null && item !== undefined)
                            .filter((item, idx, arr) => arr.indexOf(item) === idx)
                            .filter(item => typeof item === 'string')
                        : []

                    rowData.forEach((item, index) => {
                        if (index === 0) contact.position = item
                        if (index === 1) contact.name = item
                        if (index === 2) contact.phone = item
                        if (index === 3) contact.email = item
                        if (index === 4) contact.payinfo = item
                        company.contacts.push(contact)
                    })
                }
            })
            sheetItem.company = company
            data.push(sheetItem)
        })




        // sheet.eachRow((row, rowNumber) => {
        //     // if (rowNumber === 1) return; // Пропускаем заголовок

        //     const [
        //         idCell,
        //         complectId,
        //         complectName,

        //         monthSumCell,
        //         contractPrepaymentCell,
        //         // contractLongCell,
        //         contractEndDateCell,
        //         contractTypeCell,
        //         quantityStringCell,

        //         // company
        //         companyCell,
        //         documentCell,
        //         communicationsRateCell,
        //         // kitCell,

        //         // product


        //         // contact
        //         contactNameCell,
        //         positionCell,
        //         phoneCell,
        //         emailCell,

        //         payinfoCell,
        //         complectInfoCell,
        //         concurentCell,
        //         supplyDateCell,
        //         contactFirstEduCell, //Вводное Обучение дата/ менеджер обучивший
        //         contactFirstEduCommentCell, //Комментарий (что дали, чему обучили)
        //         contactEduCell, //Вводное Обучение дата/ менеджер обучивший
        //         contactEduCommentCell, //Комментарий (что дали, чему обучили)
        //         contactExaminationCell, //Проверка
        //         contactQualificationCell, //Звонок качества
        //         contactSkap,
        //         conmtactGl,
        //         contactGarantClub

        //     ] = [
        //             row.getCell(1).value, //id
        //             row.getCell(2).value, //complectId
        //             row.getCell(3).value, //complectName

        //             row.getCell(4).value, //month sum
        //             row.getCell(5).value, //contract prepayment 

        //             // row.getCell(6).value, //contract long
        //             row.getCell(6).value, //contract end date

        //             row.getCell(7).value, //contract type
        //             row.getCell(8).value, //quantity string




        //             row.getCell(9).value, //company
        //             row.getCell(10).value, //document
        //             row.getCell(11).value, //communicationsRate


        //             row.getCell(12).value, //contact name
        //             row.getCell(13).value, //position
        //             row.getCell(14).value, //contactinfo
        //             row.getCell(15).value, //email
        //             row.getCell(16).value, //payinfo
        //             row.getCell(17).value, //complectInfo
        //             row.getCell(18).value, //concurent
        //             row.getCell(19).value, //supplyDate

        //             row.getCell(20).value, //contactFirstEdu
        //             row.getCell(21).value, //contactFirstEduComment
        //             row.getCell(22).value, //contactEdu
        //             row.getCell(23).value, //contactEduComment
        //             row.getCell(24).value, //contactExamination
        //             row.getCell(25).value, //contactQualification
        //             row.getCell(26).value, //contactSkap
        //             row.getCell(27).value, //conmtactGl
        //             row.getCell(28).value, //contactGarantClub



        //         ];
        //     }
        // )

        return data
    }

}
