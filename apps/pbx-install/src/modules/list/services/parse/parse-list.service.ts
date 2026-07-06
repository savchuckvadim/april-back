import { StorageService, StorageType } from '@/core/storage';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { unwrapExcelCellValue } from '@app/pbx-install/shared';
import { List, ListFolderEnum, ListGroupEnum } from '../../type/parse.type';
import { ListImportSheetRow } from '../../type/list-sheet.type';
import { ParseListFieldsService } from './parse-list-fields.service';

/** Имена листов в шаблоне `install/<group>/list/<folder>/data.xlsx` */
const LISTS_SHEET = 'lists';
const FIELDS_SHEET = 'fields';
const FIELD_ITEMS_SHEET = 'fieldsItems';

/** Список эталона с указанием источника (папки шаблона) */
export interface ListTemplateSource {
    listName: ListFolderEnum;
    group: ListGroupEnum;
    list: List;
}

@Injectable()
export class ParseListService {
    private readonly logger = new Logger(ParseListService.name);
    private readonly installPath = 'install';
    constructor(
        private readonly storageService: StorageService,
        private readonly parseListFieldsService: ParseListFieldsService,
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
            throw new NotFoundException(
                `List template not found: ${fullPath}/${fileName}`,
            );
        }
        return await this.parseData(path);
    }

    /**
     * Весь эталон: перебор folder × group, отсутствующие шаблоны пропускаются.
     * Каждый список аннотирован источником (папкой) — он нужен фронту для
     * точечной установки через install/domain/:domain/listName/:listName/group/:group.
     */
    async getAllTemplates(): Promise<ListTemplateSource[]> {
        const result: ListTemplateSource[] = [];
        for (const listName of Object.values(ListFolderEnum)) {
            for (const group of Object.values(ListGroupEnum)) {
                let lists: List[];
                try {
                    lists = await this.getParsedData(listName, group);
                } catch (e) {
                    if (e instanceof NotFoundException) {
                        continue;
                    }
                    throw e;
                }
                result.push(...lists.map(list => ({ listName, group, list })));
            }
        }
        return result;
    }

    private async parseData(path: string): Promise<List[]> {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(path);
        const listsSheet = this.getSheet(workbook, LISTS_SHEET, path);
        const fieldsSheet = this.getSheet(workbook, FIELDS_SHEET, path);
        const fieldItemsSheet = this.getSheet(
            workbook,
            FIELD_ITEMS_SHEET,
            path,
        );

        return this.createLists(listsSheet, fieldsSheet, fieldItemsSheet);
    }

    private getSheet(
        workbook: ExcelJS.Workbook,
        name: string,
        path: string,
    ): ExcelJS.Worksheet {
        const sheet = workbook.getWorksheet(name);
        if (!sheet) {
            this.logger.error(`Sheet "${name}" not found in ${path}`);
            throw new NotFoundException(
                `Sheet "${name}" not found in list template`,
            );
        }
        return sheet;
    }

    private createLists(
        listsSheet: ExcelJS.Worksheet,
        fieldsSheet: ExcelJS.Worksheet,
        fieldItemsSheet: ExcelJS.Worksheet,
    ): List[] {
        // Все списки одного файла разделяют общий набор полей
        const fields = this.parseListFieldsService.getFieldsData(
            fieldsSheet,
            fieldItemsSheet,
        );
        return this.getBaseListsData(listsSheet).map(list => ({
            ...list,
            fields,
        }));
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

            const [id, type, group, name, code, order] = values;
            if (!type || !code) return;

            resultLists.push({
                id: String(id),
                type: String(type),
                group: String(group),
                name: String(name),
                code: String(code),
                order: Number(order),
                fields: [],
            });
        });

        return resultLists;
    }
}
