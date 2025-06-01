import { Injectable } from "@nestjs/common";
import { SupplyUpdate } from "../../type/supply.type";
import * as ExcelJS from 'exceljs';
import { StorageService, StorageType } from "src/core/storage";
@Injectable()
export class SupplyParseService {
    constructor(
        private readonly storage: StorageService
    ) { }
    async getSupplies(): Promise<SupplyUpdate[] | null> {
        const path = await this.getPath()
        if (!path) {
            return null
        }
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(path);
        const sheet = workbook.worksheets[2];
        const sheet2 = workbook.worksheets[3];
        // const supplies = [] as SupplyUpdate[]
        const supplies = this.parseSheet(sheet)
        return supplies

    }
    private async parseSheet(sheet: ExcelJS.Worksheet): Promise<SupplyUpdate[]> {
        const supplies = [] as SupplyUpdate[]
        return supplies
    }
    private async getPath() {
        const path = this.storage.getFilePath(
            StorageType.APP,
            'garant',
            'supply.xlsx'
        )
        const fileExists = await this.storage.fileExists(path);
        if (!fileExists) {
            return null;
        }
        return path
    }
}
