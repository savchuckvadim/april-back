import { Injectable, Logger } from '@nestjs/common';
import { StorageService, StorageType } from 'src/core/storage';
import { SupplyEntity } from '../supply.entity';
import * as ExcelJS from 'exceljs';

/** Распарсенная строка листа поставок */
interface ParsedSupplyRow {
    number: number | null;
    name: string;
    contractName: string | null;
    coefficient: number;
    contractPropSuppliesQuantity: string | null;
    contractProp1: string | null;
    contractProp2: string | null;
    contractPropLoginsQuantity: string | null;
    contractPropComment: string | null;
    contractPropEmail: string | null;
    type: string;
    quantityForKp: string | null;
    lcontractProp2: string | null;
    lcontractName: string | null;
    lcontractPropComment: string | null;
    lcontractPropEmail: string | null;
    acontractName: string | null;
    acontractPropComment: string | null;
}

/**
 * Безопасно преобразует значение ячейки ExcelJS в строку.
 * Значение ячейки может быть строкой, числом, датой, формулой,
 * гиперссылкой или rich text — поэтому простой String() недопустим.
 */
function cellToString(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) {
        return '';
    }
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (typeof value === 'object') {
        if ('richText' in value && Array.isArray(value.richText)) {
            return value.richText.map(part => part.text).join('');
        }
        if ('result' in value) {
            return cellToString(value.result as ExcelJS.CellValue);
        }
        if ('text' in value && typeof value.text === 'string') {
            return value.text;
        }
    }
    return '';
}

/** Преобразует значение ячейки в число (0 при невозможности). */
function cellToNumber(value: ExcelJS.CellValue): number {
    const parsed = Number(cellToString(value));
    return Number.isNaN(parsed) ? 0 : parsed;
}

/** Возвращает строку или null, если значение пустое. */
function cellToNullableString(value: ExcelJS.CellValue): string | null {
    const str = cellToString(value);
    return str === '' ? null : str;
}

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

            const data = this.parseSheet(supplySheet);

            return data.map(row => ({
                name: row.name,
                fullName: row.name,
                shortName: row.name,
                code: row.number !== null ? String(row.number) : '', // Используем number как code
                type: row.type,
                coefficient: row.coefficient,
                contractName: row.contractName,
                contractPropComment: row.contractPropComment,
                contractPropEmail: row.contractPropEmail,
                contractPropLoginsQuantity: row.contractPropLoginsQuantity,
                lcontractName: row.lcontractName,
                lcontractPropComment: row.lcontractPropComment,
                lcontractPropEmail: row.lcontractPropEmail,
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

    private parseSheet(sheet: ExcelJS.Worksheet): ParsedSupplyRow[] {
        const supplies: ParsedSupplyRow[] = [];

        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Пропускаем заголовок

            const name = cellToString(row.getCell(2).value);
            if (!name) return; // Пропускаем пустые строки

            const numberValue = row.getCell(1).value;

            supplies.push({
                number:
                    cellToString(numberValue) === ''
                        ? null
                        : cellToNumber(numberValue),
                name,
                contractName: cellToNullableString(row.getCell(3).value),
                coefficient: cellToNumber(row.getCell(4).value),
                contractPropSuppliesQuantity: cellToNullableString(
                    row.getCell(5).value,
                ),
                contractProp1: cellToNullableString(row.getCell(6).value),
                contractProp2: cellToNullableString(row.getCell(7).value),
                contractPropLoginsQuantity: cellToNullableString(
                    row.getCell(8).value,
                ),
                contractPropComment: cellToNullableString(row.getCell(9).value),
                contractPropEmail: cellToNullableString(row.getCell(10).value),
                type: cellToString(row.getCell(11).value),
                quantityForKp: cellToNullableString(row.getCell(12).value),
                lcontractProp2: cellToNullableString(row.getCell(13).value),
                lcontractName: cellToNullableString(row.getCell(14).value),
                lcontractPropComment: cellToNullableString(
                    row.getCell(15).value,
                ),
                lcontractPropEmail: cellToNullableString(row.getCell(16).value),
                acontractName: cellToNullableString(row.getCell(17).value),
                acontractPropComment: cellToNullableString(
                    row.getCell(18).value,
                ),
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

    getExampleFilePath(): string {
        return this.storage.getFilePath(
            StorageType.APP,
            'garant',
            'supply.xlsx',
        );
    }
}
