import { StorageService, StorageType } from '@/core/storage';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ParseFieldsService } from '@/modules/install/shared/parse-field-excel/services/parse-fields.service';
import { PbxEntityGroupEnum } from '@/modules/install/shared/entity/field/parse-entity-field.service';
import { Category, Stage, unwrapExcelCellValue } from '@/modules/install/shared';
/** Categories sheet row (full row.values incl. ExcelJS leading empty cell) */
type CategoryImportSheetRow = readonly [
    unknown,
    string, //id 1
    string, // entityTypeId 2
    string, //entityType deal
    string, //type base
    string,  // group service
    string, // name Сервис
    string, // code service_base
    string, //order
    string, //isDefault Y N
];

/** Stages sheet row (full row.values incl. ExcelJS leading empty cell) */
type StageImportSheetRow = readonly [
    unknown,
    string, //id
    string, //categoryId
    string, //name
    string, //semantic P | S | F
    string, //bitrixId NEW  SUPPLY
    string, //color
    string, //code
    string, // entityType deal
    string, //parentType service (appName)
    string, //order (number)
    'Y' | 'N', //is default
];
export type EntityParseData = {
    count: number;
    categories: Category[];
};

export enum ParseCategoryNameEnum {
    sales_base = 'sales_base', // отел продаж
    sales_xo = 'sales_xo', // отел продаж
    sales_presentation = 'sales_presentation', // отел продаж
    tmc_base = 'tmc_base', // отел продаж
    service_base = 'service_base' //отдел сервиса
}
export type ParseCategoryName = ParseCategoryNameEnum | 'all'

export const PARSE_CATEGORY_NAME_VALUES = [
    ParseCategoryNameEnum.sales_base,
    ParseCategoryNameEnum.sales_xo,
    ParseCategoryNameEnum.sales_presentation,
    ParseCategoryNameEnum.tmc_base,
    ParseCategoryNameEnum.service_base,
    'all',
] as const satisfies readonly ParseCategoryName[];
const DEAL_CATEGORY_FOLDER_NAME = 'deal'
@Injectable()
export class ParseCategoryService {
    private readonly logger = new Logger(ParseCategoryService.name);
    private readonly installPath = 'install';
    constructor(
        private readonly storageService: StorageService,
    ) { }

    async getParsedData(
        categoryName: ParseCategoryName,
        group: PbxEntityGroupEnum,
    ): Promise<EntityParseData> {
        const fullPath = `${this.installPath}/${group}/${DEAL_CATEGORY_FOLDER_NAME}/`;
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
        const data = await this.parseData(path, categoryName);
        return data;
    }

    private async parseData(
        path: string,
        categoryName: ParseCategoryName,
    ): Promise<EntityParseData> {

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(path);
        // const colorsSheet = workbook.worksheets[0];
        const categoriesSheet = workbook.worksheets[1];
        const stagesSheet = workbook.worksheets[2];



        let categories = this.getCategoriesData(categoriesSheet);
        if (categoryName && categoryName !== 'all') {
            categories = categories.filter(c => c.code === categoryName);
        }

        categories.forEach(category => {
            category.stages = this.getStagesData(stagesSheet, category);
        });

        return { count: categories.length || 0, categories };
    }

    private getCategoriesData(
        categoriesSheet: ExcelJS.Worksheet,
    ): Category[] {
        const rows: CategoryImportSheetRow[] = [];
        categoriesSheet.eachRow((row, index) => {
            if (index === 1) return;
            const rawValues = row.values as unknown[];
            rows.push(
                rawValues.map(unwrapExcelCellValue) as unknown as CategoryImportSheetRow,
            );
        });

        return rows.map(values => {
            const [
                ,
                id,
                entityTypeId,
                entityType,
                type,
                group,
                name,
                code,
                order,
                isDefault,
            ] = values;
            const category: Category = {
                id,
                entityTypeId,
                entityType,
                type,
                group,
                name,
                title: name,
                bitrixId: '',
                bitrixCamelId: '',
                code,
                isActive: true,
                isNeedUpdate: true,
                order: Number(order),
                isDefault: isDefault === 'Y',
                stages: [],
            };
            return category;
        });
    }

    private getStagesData(
        stagesSheet: ExcelJS.Worksheet,
        parentCategory: Category,
    ): Stage[] {
        const rows: StageImportSheetRow[] = [];
        stagesSheet.eachRow((row, index) => {
            if (index === 1) return;
            const rawValues = row.values as unknown[];
            rows.push(
                rawValues.map(unwrapExcelCellValue) as unknown as StageImportSheetRow,
            );
        });

        const stages: Stage[] = [];
        for (const values of rows) {
            const [
                ,
                id,
                categoryId,
                name,
                type,
                bitrixId,
                color,
                code,
                entityType,
                parentType,
                order,
                isDefault,
            ] = values;
            if (categoryId !== parentCategory.id) continue;
            stages.push({
                id,
                entityTypeId: parentCategory.entityTypeId,
                entityType,
                parentType,
                type,
                group: parentCategory.group,
                name,
                title: name,
                bitrixId,
                isActive: true,
                smartBitrixId: '',
                color,
                code,
                isNeedUpdate: true,
                order: Number(order),
                bitrixEnitiyId: '',
                isDefault,
            });
        }
        return stages;
    }
}
