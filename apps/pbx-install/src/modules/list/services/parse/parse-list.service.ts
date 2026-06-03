import { StorageService, StorageType } from '@/core/storage';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { unwrapExcelCellValue } from '@app/pbx-install/shared';
import { ParseSmartFieldsService } from '@app/pbx-install/shared/parse-field-excel/services/parse-smart-fields.service';
import { List, ListFolderEnum, ListGroupEnum } from '../../type/parse.type';

/** Excel sheet row for smarts tab after stripping column 0 and unwrapping formula cells */
type ListImportSheetRow = readonly [
    string, // id
    string, // type
    string, // group
    string, // name
    string, // code
    string, // isActive TRUE | FALSE
    string, // order
];

@Injectable()
export class ParseListService {
    private readonly logger = new Logger(ParseListService.name);
    private readonly installPath = 'install';
    constructor(
        private readonly storageService: StorageService,
        private readonly parseFieldsService: ParseSmartFieldsService,
    ) {}

    async getParsedData(
        listFolder: ListFolderEnum,
        group: ListGroupEnum,
    ): Promise<List[]> {
        const fullPath = `${this.installPath}/${group}/list/${listFolder}`;
        const fileName = 'data.xlsx';
        const path = this.storageService.getFilePath(
            StorageType.APP,
            fullPath,
            fileName,
        );
        const exists = await this.storageService.fileExistsByType(
            StorageType.APP,
            fullPath,
            fileName,
        );
        if (!exists) {
            throw new NotFoundException('File not found');
        }
        const data = await this.parseData(path);
        return data;
    }

    private async parseData(path: string): Promise<List[]> {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(path);
        // const colorsSheet = workbook.worksheets[0];
        const listsSheet = workbook.worksheets[1];
        const fieldsSheet = workbook.worksheets[2];
        const fieldItemsSheet = workbook.worksheets[3];

        const data = this.createLists(listsSheet, fieldsSheet, fieldItemsSheet);

        return data;
    }

    private createLists(
        listsSheet: ExcelJS.Worksheet,
        fieldsSheet: ExcelJS.Worksheet,
        fieldItemsSheet: ExcelJS.Worksheet,
    ): List[] {
        const resultLists: List[] = [];
        const baseListsData = this.getBaseListsData(listsSheet);

        baseListsData.forEach(list => {
            list.fields = this.parseFieldsService.getFieldsData(
                fieldsSheet,
                fieldItemsSheet,
            );
            resultLists.push(list);
        });

        return resultLists;
    }

    private getBaseListsData(listsSheet: ExcelJS.Worksheet): List[] {
        const resultLists: List[] = [];

        listsSheet.eachRow((row, index) => {
            // Пропускаем заголовок (первую строку с индексом 1)
            if (index === 1) return;
            const rawValues = row.values as unknown[];
            // Удаляем первый пустой элемент (ExcelJS вставляет пустой элемент в начале)
            const values = rawValues
                .slice(1)
                .map(unwrapExcelCellValue) as unknown as ListImportSheetRow;

            const [id, type, group, name, code, isActive, order] = values;

            const list: List = {
                id,
                type,
                group,
                name,
                code,
                isActive: Boolean(isActive),
                order: Number(order),
                fields: [],
            };

            resultLists.push(list);
        });

        return resultLists;
    }
}
