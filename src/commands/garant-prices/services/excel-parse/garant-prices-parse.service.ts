import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';



export type ParsedPrice = {
    name: string,
    number: number,
    complectNumber: string,
    code: string,
    price: number,
    supplyCode: string,
    region: number,
    complectType: 0 | 1,
    supplyNumber: number
}

@Injectable()
export class GarantPricesParseService {
    private readonly logger = new Logger(GarantPricesParseService.name);
    constructor(

    ) { }

    async parseProfPrices(filePath: string): Promise<ParsedPrice[]> {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const sheet = workbook.worksheets[2];
        const sheet2 = workbook.worksheets[3];
        const prices = [] as ParsedPrice[]


        [sheet, sheet2].forEach((sht, rgn) => sht.eachRow((complectRow, rowNumber) => {
            if (rowNumber === 1) return; // Пропускаем заголовок

            const values = [
                complectRow.getCell(1).value, // complect name
                complectRow.getCell(2).value, // complect number
                complectRow.getCell(3).value, // complect code
                complectRow.getCell(4).value, // supply1Od
                complectRow.getCell(5).value, // supply2Od
                complectRow.getCell(6).value, // supply3Od
                complectRow.getCell(7).value, // supply5Od
                complectRow.getCell(8).value, // supply10Od
                complectRow.getCell(9).value, // supply20Od
                complectRow.getCell(10).value, // supply30Od
                complectRow.getCell(11).value, // supply50Od
                // complectRow.getCell(12).value/ supply100Od
            ];
            let count = 0
            const [complectName, complectNumber, code, od1, od2, od3, od5, od10, od20, od30, od50] = values;
            let proximaSupplyNumbers = [10, 11, 12, 13, 14, 15, 16, 17, 18]
            let internetSupplyNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9]

            values.forEach((value, index) => {
                if (complectName && index > 2) {
                    // let ods = [od1, od2, od3, od5, od10, od20, od30, od50]
                 

                    // ods.forEach((internetPrice, supI) => { //internet regions
                    const cleanPrice = value?.toString().replace("р.", "").replace(",", "");
                    let internetPriceNum = parseFloat(cleanPrice || "0");  // Конвертируем строку в число


                    const price = {
                        number: count,
                        name: complectName?.toString() || '',
                        code: code?.toString() || '',
                        supplyCode: `${index - 2}` as string,
                        complectNumber: complectNumber?.toString() || '',
                        supplyNumber: internetSupplyNumbers[index],
                        price: internetPriceNum,
                        region: 0,  //0 - regions / 1 - msk
                        complectType: 0   // 0 - internet 1 - proxima
                    } as ParsedPrice

                    prices.push(price)
                    count++


                    // })











                    // const complectPrice = {
                    //     name: complectName?.toString() || '',
                    //     code: code?.toString() || '',
                    //     price: value?.toString() || '',
                    //     supplyCode: `${index - 2}` as string,
                    //     region: rgn
                    // } as ParsedPrice
                    // this.logger.log(complectPrice)
                    // prices.push(complectPrice)
                }
            })


            values.forEach((proximaPrice, supI) => { //proxima
                if (complectName && supI > 2) {
                    const cleanPrice = proximaPrice?.toString().replace("р.", "").replace(",", "");
                    let proximaPriceNum = parseFloat(cleanPrice || "0");  // Конвертируем строку в число

                    if (supI === 0) {

                        let flashPrice = {
                            number: count,
                            name: complectName?.toString() || '',
                            code: code?.toString() || '',
                            supplyCode: `${supI - 2}` as string,
                            complectNumber: complectNumber?.toString() || '',
                            supplyNumber: proximaSupplyNumbers[supI],
                            price: proximaPriceNum,
                            region: rgn,  //0 - regions / 1 - msk
                            complectType: 1   // 0 - internet 1 - proxima
                        } as ParsedPrice

                        prices.push(flashPrice)
                        count++


                        let price = {
                            number: count,
                            name: complectName?.toString() || '',
                            code: code?.toString() || '',
                            supplyCode: `${supI - 2}` as string,
                            complectNumber: complectNumber?.toString() || '',
                            supplyNumber: proximaSupplyNumbers[supI + 1],
                            price: proximaPriceNum,
                            region: rgn,  //0 - regions / 1 - msk
                            complectType: 1   // 0 - internet 1 - proxima
                        } as ParsedPrice

                        prices.push(price)
                        count++



                    } else {
                        let price = {
                            number: count,
                            name: complectName?.toString() || '',
                            code: code?.toString() || '',
                            supplyCode: `${supI - 2}` as string,
                            complectNumber: complectNumber?.toString() || '',
                            supplyNumber: proximaSupplyNumbers[supI + 1],
                            price: proximaPriceNum,
                            region: rgn,  //0 - regions / 1 - msk
                            complectType: 1   // 0 - internet 1 - proxima
                        } as ParsedPrice

                        prices.push(price)
                        count++

                    }
                }


            })


        }));
        this.logger.log(prices)

        return prices;

    }


}