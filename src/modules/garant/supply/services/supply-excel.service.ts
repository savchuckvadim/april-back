import { Injectable, Logger } from '@nestjs/common';
import { StorageService, StorageType } from 'src/core/storage';
import { SupplyEntity } from '../supply.entity';
import * as ExcelJS from 'exceljs';

@Injectable()
export class SupplyExcelService {
    private readonly logger = new Logger(SupplyExcelService.name);
    constructor(private readonly storage: StorageService) {}

    async readSuppliesFromExcel(): Promise<Partial<SupplyEntity>[] | null> {
        const path = await this.getPath();
        if (!path) {
            throw new Error(
                'FAIL PATH: Failed to read supplies from Excel file',
            );
        }
        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(path);

            // Лист supply
            const supplySheet =
                workbook.worksheets.find(sheet => sheet.name === 'supply') ||
                workbook.worksheets[0];

            if (!supplySheet) {
                throw new Error('Supply sheet not found in Excel file');
            }

            const data = await this.parseSheet(supplySheet);

            return data.map((row: any) => ({
                name: String(row.name || ''),
                fullName: String(row.name || ''),
                shortName: String(row.name || ''),
                code: String(row.number || ''), // Используем number как code
                type: String(row.type || ''),
                coefficient: Number(row.coefficient || 0),
                contractName: row.contractName
                    ? String(row.contractName)
                    : null,
                contractPropComment: row.contractPropComment
                    ? String(row.contractPropComment)
                    : null,
                contractPropEmail: row.contractPropEmail
                    ? String(row.contractPropEmail)
                    : null,
                contractPropLoginsQuantity: row.contractPropLoginsQuantity
                    ? String(row.contractPropLoginsQuantity)
                    : null,
                lcontractName: row.lcontractName
                    ? String(row.lcontractName)
                    : null,
                lcontractPropComment: row.lcontractPropComment
                    ? String(row.lcontractPropComment)
                    : null,
                lcontractPropEmail: row.lcontractPropEmail
                    ? String(row.lcontractPropEmail)
                    : null,
                usersQuantity: 0, // По умолчанию
                description: null,
                color: null,
                saleName_1: null,
                saleName_2: null,
                saleName_3: null,
            }));
        } catch (error) {
            this.logger.error('Error reading supplies from Excel:', error);
            throw new Error('Failed to read supplies from Excel file: ' + path);
        }
    }

    private async parseSheet(sheet: ExcelJS.Worksheet): Promise<any[]> {
        const supplies: any[] = [];

        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Пропускаем заголовок

            const values = [
                row.getCell(1).value, // number
                row.getCell(2).value, // name
                row.getCell(3).value, // contractName
                row.getCell(4).value, // coefficient
                row.getCell(5).value, // contractPropSuppliesQuantity
                row.getCell(6).value, // contractProp1
                row.getCell(7).value, // contractProp2
                row.getCell(8).value, // contractPropLoginsQuantity
                row.getCell(9).value, // contractPropComment
                row.getCell(10).value, // contractPropEmail
                row.getCell(11).value, // type
                row.getCell(12).value, // quantityForKp
                row.getCell(13).value, // lcontractProp2
                row.getCell(14).value, // lcontractName
                row.getCell(15).value, // lcontractPropComment
                row.getCell(16).value, // lcontractPropEmail
                row.getCell(17).value, // acontractName
                row.getCell(18).value, // acontractPropComment
            ];

            const [
                number,
                name,
                contractName,
                coefficient,
                contractPropSuppliesQuantity,
                contractProp1,
                contractProp2,
                contractPropLoginsQuantity,
                contractPropComment,
                contractPropEmail,
                type,
                quantityForKp,
                lcontractProp2,
                lcontractName,
                lcontractPropComment,
                lcontractPropEmail,
                acontractName,
                acontractPropComment,
            ] = values;

            if (!name) return; // Пропускаем пустые строки

            supplies.push({
                number: number ? Number(number) : null,
                name: String(name || ''),
                contractName: contractName ? String(contractName) : null,
                coefficient: coefficient ? Number(coefficient) : 0,
                contractPropSuppliesQuantity: contractPropSuppliesQuantity
                    ? String(contractPropSuppliesQuantity)
                    : null,
                contractProp1: contractProp1 ? String(contractProp1) : null,
                contractProp2: contractProp2 ? String(contractProp2) : null,
                contractPropLoginsQuantity: contractPropLoginsQuantity
                    ? String(contractPropLoginsQuantity)
                    : null,
                contractPropComment: contractPropComment
                    ? String(contractPropComment)
                    : null,
                contractPropEmail: contractPropEmail
                    ? String(contractPropEmail)
                    : null,
                type: type ? String(type) : '',
                quantityForKp: quantityForKp ? String(quantityForKp) : null,
                lcontractProp2: lcontractProp2 ? String(lcontractProp2) : null,
                lcontractName: lcontractName ? String(lcontractName) : null,
                lcontractPropComment: lcontractPropComment
                    ? String(lcontractPropComment)
                    : null,
                lcontractPropEmail: lcontractPropEmail
                    ? String(lcontractPropEmail)
                    : null,
                acontractName: acontractName ? String(acontractName) : null,
                acontractPropComment: acontractPropComment
                    ? String(acontractPropComment)
                    : null,
            });
        });

        return supplies;
    }

    private async getPath() {
        const path = this.storage.getFilePath(
            StorageType.APP,
            'garant',
            'supply.xlsx',
        );
        const fileExists = await this.storage.fileExists(path);
        if (!fileExists) {
            return null;
        }
        return path;
    }

    async saveUploadedFile(fileBuffer: Buffer): Promise<string> {
        const path = await this.storage.saveFile(
            fileBuffer,
            'supply.xlsx',
            StorageType.APP,
            'garant',
        );
        return path;
    }

    async getExampleFilePath(): Promise<string> {
        return this.storage.getFilePath(
            StorageType.APP,
            'garant',
            'supply.xlsx',
        );
    }
}
