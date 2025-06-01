import { Injectable, Logger } from '@nestjs/common';
import { StorageService, StorageType } from 'src/core/storage';
import { RegionEntity } from '../region.entity';
import * as ExcelJS from 'exceljs';


@Injectable()
export class RegionExcelService {
    private readonly logger = new Logger(RegionExcelService.name);
    private readonly tax: number = 1.2;
    constructor(
        private readonly storage: StorageService,
    ) { }

    async readRegionsFromExcel(): Promise<Partial<RegionEntity>[] | null> {

        const path = await this.getPath()
        if (!path) {
            throw new Error('FAIL PATH:Failed to read regions from Excel file');
        }
        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(path);
            const sheet = workbook.worksheets[0];

            const data = await this.parseSheet(sheet)

            return data.map((row: any) => ({
                number: Number(row.number),
                title: String(row.title),
                code: String(row.code),
                infoblock: String(row.infoblock),
                abs: Number(row.abs),
                tax: Number(row.tax),
                tax_abs: Number(row.tax_abs)
            }));
        } catch (error) {
            console.error('Error reading regions from Excel:', error);
            throw new Error('Failed to read regions from Excel file' + path);
        }
    }

    private async parseSheet(sheet: ExcelJS.Worksheet): Promise<RegionEntity[]> {
        const regions = [] as RegionEntity[]


        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Пропускаем заголовок
            const values = [
                row.getCell(1).value, // number
                row.getCell(2).value, // title
                row.getCell(3).value, // rabs
                row.getCell(4).value, // code
                row.getCell(5).value, // Infoblock


            ];
            const [number, title, rabs, code, infoblock] = values;
            console.log(number, title)
            const cleanRabs = rabs?.toString().replace("р.", "").replace(",", "") || "0";
            const abs = parseFloat(cleanRabs);
            console.log(abs)
            console.log(this.tax)
            const tax_abs = (Number(abs) * this.tax).toFixed(2)
            console.log(tax_abs)
            const region = new RegionEntity();
            region.number = Number(number);
            region.title = String(title);
            region.abs = Number(abs);
            region.code = String(code);
            region.infoblock = String(infoblock);
            region.tax = this.tax;
            region.tax_abs = Number(tax_abs);
            regions.push(region);
        })
        return regions
    }

    private async getPath() {
        const path = this.storage.getFilePath(
            StorageType.APP,
            'garant',
            'regions.xlsx'
        )
        const fileExists = await this.storage.fileExists(path);
        if (!fileExists) {
            return null;
        }
        return path
    }
} 