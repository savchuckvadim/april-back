import { StorageService, StorageType } from '@/core/storage';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { Smart } from '../../type/parse.type';
import { SmartGroupEnum, SmartNameEnum } from '../../dto/install-smart.dto';
import { EUserFieldType } from '@/modules/bitrix';
import { Category, Stage, unwrapExcelCellValue } from '@/modules/pbx-install/shared';
import { PbxEntityType } from '@/shared';
import { ParseSmartFieldsService } from '@/modules/pbx-install/shared/parse-field-excel/services/parse-smart-fields.service';

/** Excel sheet row for smarts tab after stripping column 0 and unwrapping formula cells */
type SmartImportSheetRow = readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    boolean,
    number,
    boolean,
];

/** Categories sheet row (full row.values incl. ExcelJS leading empty cell) */
type CategoryImportSheetRow = readonly [
    unknown,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    boolean,
    boolean,
    number,
    boolean,
];

/** Stages sheet row (full row.values incl. ExcelJS leading empty cell) */
type StageImportSheetRow = readonly [
    unknown,
    string, //id
    string, //name
    string, //title
    string, //type
    string, // group
    string, //bitrixId
    string, //color
    string, //code
    string, // entityType
    string, //parentType
    string, //isActive 'true' | 'false'
    string, // category id
    string, //isNeedUpdate 'true' | 'false'
    number, //order
    'Y' | 'N', //is default
];

@Injectable()
export class ParseSmartService {
    private readonly logger = new Logger(ParseSmartService.name);
    private readonly installPath = 'install';
    constructor(
        private readonly storageService: StorageService,
        private readonly parseFieldsService: ParseSmartFieldsService,
    ) { }

    async getParsedData(
        smartName: SmartNameEnum,
        group: SmartGroupEnum,
    ): Promise<Smart[]> {
        const fullPath = `${this.installPath}/${group}/smart/${smartName}`;
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

    private async parseData(path: string): Promise<Smart[]> {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(path);
        // const colorsSheet = workbook.worksheets[0];
        const fieldsSheet = workbook.worksheets[1];
        const fieldItemsSheet = workbook.worksheets[2];
        const smartsSheet = workbook.worksheets[3];
        const categoriesSheet = workbook.worksheets[4];
        const stagesSheet = workbook.worksheets[5];

        const data = this.createSmarts(
            smartsSheet,
            categoriesSheet,
            stagesSheet,
            fieldsSheet,
            fieldItemsSheet,
        );

        return data;
    }

    private createSmarts(
        smartsSheet: ExcelJS.Worksheet,
        categoriesSheet: ExcelJS.Worksheet,
        stagesSheet: ExcelJS.Worksheet,
        fieldsSheet: ExcelJS.Worksheet,
        fieldItemsSheet: ExcelJS.Worksheet,
    ): Smart[] {
        const resultSmarts: Smart[] = [];
        const baseSmartsData = this.getBaseSmartData(smartsSheet);

        baseSmartsData.forEach(smart => {
            const categories = this.getCategoriesData(
                categoriesSheet,
                smart.entityTypeId,
            );
            categories.forEach(category => {
                const stages = this.getStagesData(
                    stagesSheet,
                    category.id,
                    category.entityTypeId,
                );
                category.stages = stages;
            });
            smart.categories = categories;
            smart.fields = this.parseFieldsService.getFieldsData(
                fieldsSheet,
                fieldItemsSheet,
                PbxEntityType.SMART,
            );
            resultSmarts.push(smart);
        });

        return resultSmarts;
    }

    private getBaseSmartData(smartsSheet: ExcelJS.Worksheet): Smart[] {
        const resultSmarts: Smart[] = [];

        smartsSheet.eachRow((row, index) => {
            // Пропускаем заголовок (первую строку с индексом 1)
            if (index === 1) return;
            const rawValues = row.values as unknown[];
            // Удаляем первый пустой элемент (ExcelJS вставляет пустой элемент в начале)
            const values = rawValues
                .slice(1)
                .map(unwrapExcelCellValue) as unknown as SmartImportSheetRow;

            const [
                smartId,
                title,
                name,
                smartEntityTypeId,
                code,
                type,
                group,
                bitrixId,
                ,
                forStageId,
                forFilterId,
                crmId,
                forStage,
                forFilter,
                crm,
                isActive,
                smartOrder,
                ,
            ] = values;

            const smart: Smart = {
                id: smartId,
                title,
                name,
                entityTypeId: smartEntityTypeId,
                code,
                type,
                group,
                bitrixId,
                forStageId,
                forFilterId,
                crmId,
                forStage,
                forFilter,
                crm,
                isActive,
                isNeedUpdate: true,
                order: smartOrder,
                categories: [],
                fields: [],
            };

            resultSmarts.push(smart);
        });

        return resultSmarts;
    }

    private getCategoriesData(
        categoriesSheet: ExcelJS.Worksheet,
        entityTypeId: string,
    ): Category[] {
        const categoriesData: CategoryImportSheetRow[] = [];
        categoriesSheet.eachRow((row, index) => {
            if (index === 1) return; // Пропускаем заголовок (первая строка)
            const rawValues = row.values as unknown[];
            const categoryValues = rawValues.map(
                unwrapExcelCellValue,
            ) as unknown as CategoryImportSheetRow;
            categoriesData.push(categoryValues);
        });
        const categories: Category[] = [];
        categoriesData.forEach(categoryValues => {
            const [
                ,
                categoryId,
                categoryEntityTypeId,
                categoryEntityType,
                categoryType,
                categoryGroup,
                categoryName,
                categoryTitle,
                categoryBitrixId,
                categoryBitrixCamelId,
                categoryCode,
                categoryIsActive,
                categoryIsNeedUpdate,
                categoryOrder,
                cIsDefault,
            ] = categoryValues;
            if (categoryIsNeedUpdate) {
                if (entityTypeId == categoryEntityTypeId) {
                    const category: Category = {
                        id: categoryId,
                        entityTypeId: categoryEntityTypeId,
                        entityType: categoryEntityType,
                        type: categoryType,
                        group: categoryGroup,
                        name: categoryName,
                        title: categoryTitle,
                        bitrixId: categoryBitrixId,
                        bitrixCamelId: categoryBitrixCamelId,
                        code: categoryCode,
                        isActive: categoryIsActive,
                        isNeedUpdate: categoryIsNeedUpdate,
                        order: categoryOrder,
                        isDefault: cIsDefault,
                        stages: [],
                    };

                    categories.push(category);
                }
            }
        });
        return categories;
    }

    private getStagesData(
        stagesSheet: ExcelJS.Worksheet,
        categoryId: string,
        categoryEntityTypeId: string,
    ): Stage[] {
        const stagesData: StageImportSheetRow[] = [];
        const stages: Stage[] = [];
        stagesSheet.eachRow((row, index) => {
            if (index === 1) return; // Пропускаем заголовок (первая строка)
            const rawValues = row.values as unknown[];
            const stageValues = rawValues.map(
                unwrapExcelCellValue,
            ) as unknown as StageImportSheetRow;
            stagesData.push(stageValues);
        });

        stagesData.forEach(stageValues => {
            const [
                ,
                stageId,
                stageName, //presentation
                stageTitle, // Запланирована
                stageType, // smart
                stageGroup, //general
                stageBitrixId, // NEW
                stageColor, // #3bc8f5
                stageCode, //pres_new
                stageEntityType, //smart
                stageParentType, //presentation
                stageIsActive, //true
                // stageSmartBitrixId,
                stageCategoryId,
                // stageBitrixEnitiyId,
                stageIsNeedUpdate,
                stageOrder,
                stageIsDefault,
            ] = stageValues;

            const isNeedUpdate = stageIsNeedUpdate === 'true';
            const isActive = stageIsActive === 'true';

            if (isNeedUpdate) {
                if (stageCategoryId === categoryId) {
                    const stage: Stage = {
                        id: stageId,
                        entityTypeId: categoryEntityTypeId,
                        entityType: stageEntityType,
                        parentType: stageParentType,
                        type: stageType as EUserFieldType,
                        group: stageGroup,
                        name: stageName,
                        title: stageTitle,
                        bitrixId: stageBitrixId,
                        isActive: isActive,
                        smartBitrixId: '',
                        color: stageColor,
                        code: stageCode,
                        isNeedUpdate: isNeedUpdate,
                        order: Number(stageOrder),
                        bitrixEnitiyId: '',
                        isDefault: stageIsDefault,
                    };

                    stages.push(stage);
                }
            }
        });
        console.log('stages', stages);
        return stages;
    }

}
