import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PriceCreateType } from '../../types/price-from-excel.type';
import { PriceExcelService } from './price-excel.service';

@Injectable()
export class ComplectPriceExcelParseService {
    private readonly logger = new Logger(ComplectPriceExcelParseService.name);
    constructor(private readonly excel: PriceExcelService) {}

    async readPricesFromExcel(): Promise<PriceCreateType[] | null> {
        const path = await this.excel.getPath();
        if (!path) {
            throw new Error('FAIL PATH: Failed to read prices from Excel file');
        }
        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(path);

            // Листы: prof-prices-regions (index 2) и prof-prices-msc (index 3)
            const regionsSheet = workbook.worksheets[2]; // prof-prices-regions
            const mscSheet = workbook.worksheets[3]; // prof-prices-msc

            const prices: PriceCreateType[] = [];

            // Парсим лист регионов (region_type = '0')
            if (regionsSheet) {
                const regionPrices = await this.parseSheet(regionsSheet, '0');
                prices.push(...regionPrices);
            }

            // Парсим лист Москвы (region_type = '1')
            if (mscSheet) {
                const mscPrices = await this.parseSheet(mscSheet, '1');
                prices.push(...mscPrices);
            }

            return prices;
        } catch (error) {
            this.logger.error('Error reading prices from Excel:', error);
            throw new Error('Failed to read prices from Excel file: ' + path);
        }
    }

    private async parseSheet(
        sheet: ExcelJS.Worksheet,
        regionType: '0' | '1', // '0' для регионов, '1' для Москвы
    ): Promise<PriceCreateType[]> {
        const prices: PriceCreateType[] = [];
        const internetSupplyNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        const proximaSupplyNumbers = [10, 11, 12, 13, 14, 15, 16, 17, 18];

        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Пропускаем заголовок

            const values = [
                row.getCell(1).value, // complectName
                row.getCell(2).value, // complectNumber
                row.getCell(3).value, // complectCode (может быть)
                row.getCell(4).value, // od1
                row.getCell(5).value, // od2
                row.getCell(6).value, // od3
                row.getCell(7).value, // od5
                row.getCell(8).value, // od10
                row.getCell(9).value, // od20
                row.getCell(10).value, // od30
                row.getCell(11).value, // od50
            ];

            const [
                complectName,
                complectNumber,
                complectCode,
                od1,
                od2,
                od3,
                od5,
                od10,
                od20,
                od30,
                od50,
            ] = values;

            if (!complectName || !complectCode) return;

            const ods = [od1, od2, od3, od5, od10, od20, od30, od50];
            const cCode = complectCode?.toString();
            // Internet supplies (1-9)
            ods.forEach((internetPrice, supI) => {
                const sCode = internetSupplyNumbers[supI].toString();
                const sTypeCode = '1';
                const sType = 'internet';
                const code = `${cCode}_${sCode}_${regionType}`;

                const cleanPrice =
                    internetPrice
                        ?.toString()
                        .replace('р.', '')
                        .replace(',', '') || '0';
                const priceValue = parseFloat(cleanPrice);

                if (priceValue > 0) {
                    prices.push({
                        code,
                        isSpecial: false,
                        garantPackageCode: null,
                        supplyCode: sCode,
                        supplyType: sType,
                        supplyTypeCode: sTypeCode,
                        // complect_id: BigInt(Number(complectNumber)),
                        complectCode: complectCode?.toString(),
                        // supply_id: BigInt(internetSupplyNumbers[supI]),
                        region_type: regionType,

                        value: priceValue,
                        discount: null,
                    });
                }
            });

            // Proxima supplies (10-18)
            ods.forEach((proximaPrice, supI) => {
                const cleanPrice =
                    proximaPrice
                        ?.toString()
                        .replace('р.', '')
                        .replace(',', '') || '0';
                const priceValue = parseFloat(cleanPrice);

                if (priceValue > 0) {
                    if (supI === 0) {
                        // Flash supply (10)
                        const supplyCodeFirst = String(proximaSupplyNumbers[0]);
                        const supplyCodeFlash = String(proximaSupplyNumbers[1]);
                        const code = `${cCode}_${supplyCodeFirst}_${regionType}`;
                        const codeFlash = `${cCode}_${supplyCodeFlash}_${regionType}`;
                        prices.push({
                            code,
                            complectCode: cCode,
                            supplyCode: supplyCodeFirst,
                            region_type: regionType,
                            supplyType: 'proxima',
                            supplyTypeCode: '1',
                            garantPackageCode: null,
                            isSpecial: false,
                            value: priceValue,
                            discount: null,
                        });
                        // Первый proxima supply (11)
                        prices.push({
                            code: codeFlash,
                            complectCode: cCode,
                            supplyCode: supplyCodeFlash,
                            region_type: regionType,
                            supplyType: 'proxima',
                            supplyTypeCode: '1',
                            garantPackageCode: null,
                            isSpecial: false,
                            value: priceValue,
                            discount: null,
                        });
                    } else {
                        // Остальные proxima supplies
                        const supplyCodeProxima = String(
                            proximaSupplyNumbers[supI + 1],
                        );

                        const code = `${cCode}_${supplyCodeProxima}_${regionType}`;

                        prices.push({
                            code: code,
                            complectCode: cCode,
                            supplyCode: supplyCodeProxima,
                            region_type: regionType,
                            supplyType: 'proxima',
                            supplyTypeCode: '1',
                            garantPackageCode: null,
                            isSpecial: false,
                            value: priceValue,
                            discount: null,
                        });
                    }
                }
            });
        });

        return prices;
    }
}
