import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PriceExcelService } from './price-excel.service';
import { PriceCreateType } from '../../types/price-from-excel.type';

@Injectable()
export class ServicesPriceExcelParseService {
    private readonly logger = new Logger(ServicesPriceExcelParseService.name);
    constructor(private readonly excel: PriceExcelService) {}

    async readPricesFromExcel(): Promise<PriceCreateType[] | null> {
        const path = await this.excel.getPath();
        if (!path) {
            throw new Error(
                'FAIL PATH: Failed to read services prices from Excel file',
            );
        }
        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(path);

            // Листы: prof-prices-regions (index 2) и prof-prices-msc (index 3)
            const ltSheet = workbook.worksheets[4]; // lt prices
            const starShhet = workbook.worksheets[5]; // prof-prices-msc

            const prices: PriceCreateType[] = [];

            // Парсим лист регионов (region_type = '0')
            if (ltSheet) {
                const ltPrices = await this.parseSheet(ltSheet);
                prices.push(...ltPrices);
            }

            // Парсим лист Москвы (region_type = '1')
            if (starShhet) {
                const starPrices = await this.parseSheet(starShhet);
                prices.push(...starPrices);
            }

            return prices;
        } catch (error) {
            this.logger.error('Error reading prices from Excel:', error);
            throw new Error('Failed to read prices from Excel file: ' + path);
        }
    }

    private async parseSheet(
        sheet: ExcelJS.Worksheet,
    ): Promise<PriceCreateType[]> {
        const prices: PriceCreateType[] = [];

        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Пропускаем заголовок

            const values = [
                row.getCell(1).value, // number
                row.getCell(2).value, // name
                row.getCell(3).value, // weight
                row.getCell(4).value, // mskValue
                row.getCell(5).value, // regionValue
                row.getCell(6).value, // type
                row.getCell(7).value, // packageCode
            ];

            const [
                number,
                name,
                weight,
                mskValue,
                regionValue,
                type,
                packageCode,
            ] = values;

            if (!name || !packageCode) return;

            if (Number(mskValue) > 0 || Number(regionValue) > 0) {
                prices.push({
                    code: `${type}_${number}` as string,
                    region_type: '0' as '0' | '1',
                    garantPackageCode: packageCode as 'lt' | 'star',
                    value: Number(mskValue) as number,

                    discount: null,
                    isSpecial: false,
                    complectCode: null,
                    supplyTypeCode: null,
                    supplyCode: null,
                    supplyType: null,
                });
                prices.push({
                    code: `${type}_${number}` as string,
                    region_type: '1' as '0' | '1',
                    garantPackageCode: packageCode as 'lt' | 'star',
                    value: Number(regionValue) as number,
                    discount: null,

                    isSpecial: false,
                    complectCode: null,
                    supplyTypeCode: null,
                    supplyCode: null,
                    supplyType: null,
                });
            }
        });

        return prices;
    }
}
