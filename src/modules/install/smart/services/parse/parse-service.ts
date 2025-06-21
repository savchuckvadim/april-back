import { StorageService, StorageType } from "@/core/storage";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import * as ExcelJS from 'exceljs';
import { Category, Field, ListItem, Smart, Stage } from "../../type/parse.type";
import { SmartNameEnum } from "../../dto/install-smart.dto";
import { EUserFieldType } from "@/modules/bitrix";



@Injectable()
export class ParseSmartService {
    private readonly logger = new Logger(ParseSmartService.name);
    private readonly installPath = 'install/service/smart';
    constructor(

        private readonly storageService: StorageService
    ) { }

    async getParsedData(smartName: SmartNameEnum): Promise<Smart[]> {
        const fullPath = `${this.installPath}/${smartName}`
        const fileName = 'data.xlsx'
        const path = this.storageService.getFilePath(StorageType.APP, fullPath, fileName)
        const exists = await this.storageService.fileExistsByType(StorageType.APP, fullPath, fileName)
        if (!exists) {
            throw new NotFoundException('File not found');
        }
        const data = await this.parseData(path);
        return data;
    }

    private async parseData(path: string): Promise<Smart[]> {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(path);
        const colorsSheet = workbook.worksheets[0];
        const fieldsSheet = workbook.worksheets[1];
        const fieldItemsSheet = workbook.worksheets[2];
        const smartsSheet = workbook.worksheets[3];
        const categoriesSheet = workbook.worksheets[4];
        const stagesSheet = workbook.worksheets[5];

        const data = this.createSmarts(smartsSheet, categoriesSheet, stagesSheet, fieldsSheet, fieldItemsSheet);
        
        return data;
    }

    private createSmarts(
        smartsSheet: ExcelJS.Worksheet, 
        categoriesSheet: ExcelJS.Worksheet, 
        stagesSheet: ExcelJS.Worksheet,
        fieldsSheet: ExcelJS.Worksheet,
        fieldItemsSheet: ExcelJS.Worksheet
    ): Smart[] {

        const resultSmarts: Smart[] = [];
        const baseSmartsData = this.getBaseSmartData(smartsSheet);
      
        baseSmartsData.forEach((smart) => {
            const categories = this.getCategoriesData(categoriesSheet, smart.entityTypeId);
            categories.forEach((category) => {
                const stages = this.getStagesData(stagesSheet, category.id, category.entityTypeId);
                category.stages = stages;
            });

            smart.categories = categories;
            smart.fields = this.getFieldsData(fieldsSheet, fieldItemsSheet);
            resultSmarts.push(smart);
        });

        return resultSmarts;
    }

    private getBaseSmartData(smartsSheet: ExcelJS.Worksheet): Smart[] {
        const resultSmarts: Smart[] = [];

        smartsSheet.eachRow((row, index) => {
            // Пропускаем заголовок (первую строку с индексом 1)
            if (index === 1) return;
            const rawValues = row.values as any[];
            // Удаляем первый пустой элемент (ExcelJS вставляет пустой элемент в начале)
            const values = rawValues.slice(1).map(v => (v && typeof v === 'object' && 'result' in v) ? v.result : v);

            const [
                smartId, title, name, smartEntityTypeId, code, type, group, bitrixId, entityTypeId, forStageId, forFilterId, crmId, forStage, forFilter, crm, isActive, smartOrder, smartIsDefault
            ] = values as any[];

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
                fields: []
            };

            resultSmarts.push(smart);
        });

        return resultSmarts;
    }

    private getCategoriesData(categoriesSheet: ExcelJS.Worksheet, entityTypeId: string): Category[] {
        const categoriesData: any[][] = [];
        categoriesSheet.eachRow((row, index) => {
            const values = row.values as any[];
            if (index === 1) return; // Пропускаем заголовок (первая строка)
            categoriesData.push(values);
        });
        const categories: Category[] = [];
        categoriesData.forEach((categoryValues) => {
            const [
                categoryId, categoryEntityTypeId, categoryEntityType, categoryType, categoryGroup, categoryName, categoryTitle, categoryBitrixId,
                categoryBitrixCamelId, categoryCode, categoryIsActive, categoryIsNeedUpdate, categoryOrder, cIsDefault
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
                        stages: []
                    };

                    categories.push(category);
                }
            }
        });
        return categories;
    }

    private getStagesData(stagesSheet: ExcelJS.Worksheet, categoryId: string, categoryEntityTypeId: string): Stage[] {
        const stagesData: any[][] = [];
        const stages: Stage[] = [];
        stagesSheet.eachRow((row, index) => {
            const values = row.values as any[];
            if (index === 1) return; // Пропускаем заголовок (первая строка)
            stagesData.push(values);
        });

        stagesData.forEach((stageValues) => {
            const [
                stageId, stageName, stageTitle, stageType, stageGroup, stageBitrixId, stageColor, stageCode, stageEntityType, stageParentType, stageIsActive, stageSmartBitrixId, stageCategoryId, stageBitrixEnitiyId, stageIsNeedUpdate,
                stageOrder
            ] = stageValues;

            if (stageIsNeedUpdate) {
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
                        isActive: stageIsActive,
                        smartBitrixId: stageSmartBitrixId,
                        color: stageColor,
                        code: stageCode,
                        isNeedUpdate: stageIsNeedUpdate,
                        order: stageOrder,
                        bitrixEnitiyId: stageBitrixEnitiyId,
                    };

                    stages.push(stage);
                }
            }
        });

        return stages;
    }

    private getFieldsData(fieldsSheet: ExcelJS.Worksheet, fieldItemsSheet: ExcelJS.Worksheet): Field[] {
        const fieldsData: any[][] = [];
        fieldsSheet.eachRow((row, index) => {
          
            if (index === 1) return; // Пропускаем заголовок (первая строка)
            const rawValues = row.values as any[];
            // Удаляем первый пустой элемент (ExcelJS вставляет пустой элемент в начале)
            const values = rawValues.slice(1).map(v => (v && typeof v === 'object' && 'result' in v) ? v.result : v);
            fieldsData.push(values);
        });

        const fields: Field[] = [];

        fieldsData.forEach((fieldValues) => {
            const [
                name, appType, shortType, type, list, code, smart, order, isNeedUpdate, multiple,
            ] = fieldValues;

            let listArray: ListItem[] = [];
            if (type === 'enumeration') {
                listArray = this.getListItems(fieldItemsSheet, code);
            }

            const field: Field = {
                name,
                appType,
                type,
                list: listArray,
                code,
                smart,
                order,
                isNeedUpdate,
                isMultiple: multiple
            };

            fields.push(field);
        });

        return fields;
    }

    private getListItems(fieldItemsSheet: ExcelJS.Worksheet, code: string): ListItem[] {
        const listArray: ListItem[] = [];
        const itemsData: any[][] = [];
        
        fieldItemsSheet.eachRow((row, index) => {
         
            if (index === 1) return; // Пропускаем заголовок (первая строка)
            const rawValues = row.values as any[];
            // Удаляем первый пустой элемент (ExcelJS вставляет пустой элемент в начале)
            const values = rawValues.slice(1).map(v => (v && typeof v === 'object' && 'result' in v) ? v.result : v);
            itemsData.push(values);
        });

        itemsData.forEach((itemValues) => {
            const [
                field_name, field_code, item_name, item_code, field_app, item_order, item_del, item_isActive, item_isNeedUpdate,
            ] = itemValues;

            if (field_code == code) {
                if (item_isNeedUpdate && item_isActive) {
                    listArray.push(
                        this.getListItem(item_name, item_code, item_order)
                    );
                }
            }
        });

        return listArray;
    }

    private getListItem(name: string, code: string, order: number): ListItem {
        return {
            VALUE: name,
            DEL: 'N',
            XML_ID: code,
            CODE: code,
            SORT: order
        };
    }

 
}