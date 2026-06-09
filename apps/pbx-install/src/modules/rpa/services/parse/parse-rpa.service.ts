import { StorageService, StorageType } from '@/core/storage';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import type {
    Field,
    ListItem,
} from '@app/pbx-install/shared/parse-field-excel/type/parse-field.type';
import { unwrapExcelCellValue } from '@app/pbx-install/shared/utils/unwrap-excel-cell.util';
import { coerceExcelBool } from '@app/pbx-install/shared/utils/coerce-bool.util';
import { Rpa, RpaCategory, RpaStage } from '../../type/parse.type';
import { RpaGroupEnum, RpaNameEnum } from '../../dto/install-rpa.dto';

/** Безопасное приведение распарсенной ячейки Excel (`unknown`) к строке. */
function toStr(v: unknown): string {
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return '';
}

/** Безопасное приведение ячейки Excel к числу. */
function toNum(v: unknown): number {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    }
    return 0;
}

/**
 * Парсер Excel-шаблона RPA-процесса (`install/<group>/rpa/<rpaName>/data.xlsx`).
 *
 * Раскладка листов (подтверждена реальным шаблоном `general/rpa/supply/data.xlsx`):
 * - [1] fields, [3] fieldsItems, [4] RPA (база), [5] RPACategory, [6] RPAStages.
 * У RPA ровно одна категория, поэтому все стадии листа `RPAStages` относятся к ней.
 */
@Injectable()
export class ParseRpaService {
    private readonly logger = new Logger(ParseRpaService.name);
    private readonly installPath = 'install';

    constructor(private readonly storageService: StorageService) {}

    async getParsedData(
        rpaName: RpaNameEnum,
        group: RpaGroupEnum,
    ): Promise<Rpa[]> {
        const fullPath = `${this.installPath}/${group}/rpa/${rpaName}`;
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
                `RPA template not found: ${fullPath}/${fileName}`,
            );
        }
        return this.parseData(path);
    }

    private async parseData(path: string): Promise<Rpa[]> {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(path);
        const fieldsSheet = workbook.worksheets[1];
        const fieldItemsSheet = workbook.worksheets[3];
        const rpaSheet = workbook.worksheets[4];
        const categoriesSheet = workbook.worksheets[5];
        const stagesSheet = workbook.worksheets[6];

        const result: Rpa[] = [];
        const baseRpas = this.getBaseRpaData(rpaSheet);
        const fields = this.getFieldsData(fieldsSheet, fieldItemsSheet);
        const stages = this.getStagesData(stagesSheet);

        baseRpas.forEach(rpa => {
            const categories = this.getCategoriesData(
                categoriesSheet,
                rpa.entityTypeId,
            );
            // У RPA одна категория — все стадии шаблона относятся к ней.
            categories.forEach(category => {
                category.stages = stages;
            });
            rpa.categories = categories;
            rpa.fields = fields;
            result.push(rpa);
        });
        return result;
    }

    private getBaseRpaData(sheet: ExcelJS.Worksheet): Rpa[] {
        const rpas: Rpa[] = [];
        sheet.eachRow((row, index) => {
            if (index === 1) return;
            const values = (row.values as unknown[])
                .slice(1)
                .map(unwrapExcelCellValue);
            const [
                id,
                title,
                name,
                entityTypeId,
                code,
                type,
                group,
                bitrixId,
                ,
                ,
                ,
                ,
                ,
                ,
                ,
                isActive,
                isNeedUpdate,
                order,
                image,
            ] = values;

            rpas.push({
                id: toStr(id),
                title: toStr(title),
                name: toStr(name),
                entityTypeId: toStr(entityTypeId),
                code: toStr(code),
                type: toStr(type),
                group: toStr(group),
                bitrixId: toStr(bitrixId),
                image: toStr(image),
                isActive: coerceExcelBool(isActive),
                isNeedUpdate: coerceExcelBool(isNeedUpdate),
                order: toNum(order),
                categories: [],
                fields: [],
            });
        });
        return rpas;
    }

    private getCategoriesData(
        sheet: ExcelJS.Worksheet,
        entityTypeId: string,
    ): RpaCategory[] {
        const categories: RpaCategory[] = [];
        sheet.eachRow((row, index) => {
            if (index === 1) return;
            const values = (row.values as unknown[]).map(unwrapExcelCellValue);
            const [
                ,
                catId,
                catEntityTypeId,
                ,
                catType,
                catGroup,
                catName,
                catTitle,
                catBitrixId,
                catBitrixCamelId,
                catCode,
                catIsActive,
                catIsNeedUpdate,
                catOrder,
                catIsDefault,
            ] = values;

            if (!coerceExcelBool(catIsNeedUpdate)) return;
            if (toStr(catEntityTypeId) !== entityTypeId) return;

            categories.push({
                id: toStr(catId),
                entityTypeId: toStr(catEntityTypeId),
                type: toStr(catType),
                group: toStr(catGroup),
                name: toStr(catName),
                title: toStr(catTitle),
                bitrixId: toStr(catBitrixId),
                bitrixCamelId: toStr(catBitrixCamelId),
                code: toStr(catCode),
                isActive: coerceExcelBool(catIsActive),
                isNeedUpdate: coerceExcelBool(catIsNeedUpdate),
                order: toNum(catOrder),
                isDefault: toStr(catIsDefault).toUpperCase() === 'Y',
                stages: [],
            });
        });
        return categories;
    }

    private getStagesData(sheet: ExcelJS.Worksheet): RpaStage[] {
        const stages: RpaStage[] = [];
        sheet.eachRow((row, index) => {
            if (index === 1) return;
            const values = (row.values as unknown[]).map(unwrapExcelCellValue);
            const [
                ,
                stageId,
                stageName,
                stageTitle,
                ,
                ,
                stageBitrixId,
                stageColor,
                stageCode,
                ,
                ,
                stageIsActive,
                stageSemantic,
                ,
                ,
                ,
                stageIsNeedUpdate,
                stageOrder,
                stageIsFirst,
                stageIsSuccess,
                stageIsFail,
            ] = values;

            if (!coerceExcelBool(stageIsNeedUpdate)) return;

            stages.push({
                id: toStr(stageId),
                name: toStr(stageName),
                title: toStr(stageTitle),
                bitrixId: toStr(stageBitrixId),
                color: toStr(stageColor),
                code: toStr(stageCode),
                semantic: toStr(stageSemantic),
                isActive: coerceExcelBool(stageIsActive),
                isNeedUpdate: coerceExcelBool(stageIsNeedUpdate),
                order: toNum(stageOrder),
                isFirst: coerceExcelBool(stageIsFirst),
                isSuccess: coerceExcelBool(stageIsSuccess),
                isFail: coerceExcelBool(stageIsFail),
            });
        });
        return stages;
    }

    private getFieldsData(
        fieldsSheet: ExcelJS.Worksheet,
        fieldItemsSheet: ExcelJS.Worksheet,
    ): Field[] {
        const fields: Field[] = [];
        fieldsSheet.eachRow((row, index) => {
            if (index === 1) return;
            const values = (row.values as unknown[])
                .slice(1)
                .map(unwrapExcelCellValue);
            const [
                name,
                appType,
                type,
                ,
                code,
                ,
                ,
                ,
                smart,
                ,
                ,
                order,
                ,
                ,
                isNeedUpdate,
            ] = values;

            const fieldType = toStr(type) as Field['type'];
            // bxFieldName-суффикс для RPA берём из колонки «Смарт» (RPA использует тот же UF-суффикс).
            const bxFieldName = toStr(smart);
            if (!bxFieldName) return;

            const fieldCode = toStr(code);
            const list: ListItem[] =
                fieldType === 'enumeration'
                    ? this.getListItems(fieldItemsSheet, fieldCode)
                    : [];

            fields.push({
                name: toStr(name),
                appType: toStr(appType),
                type: fieldType,
                list,
                code: fieldCode,
                bxFieldName,
                order: toNum(order),
                isNeedUpdate: coerceExcelBool(isNeedUpdate),
                isMultiple: false,
            });
        });
        return fields;
    }

    private getListItems(
        fieldItemsSheet: ExcelJS.Worksheet,
        code: string,
    ): ListItem[] {
        const items: ListItem[] = [];
        fieldItemsSheet.eachRow((row, index) => {
            if (index === 1) return;
            const values = (row.values as unknown[])
                .slice(1)
                .map(unwrapExcelCellValue);
            const [
                ,
                fieldCode,
                itemName,
                itemCode,
                ,
                itemOrder,
                itemDel,
                itemIsActive,
            ] = values;

            if (toStr(fieldCode) !== code) return;
            const isActive = coerceExcelBool(itemIsActive);
            const isDeleted = toStr(itemDel).toUpperCase() === 'Y';
            if (!isActive || isDeleted) return;
            const itemCodeStr = toStr(itemCode);
            items.push({
                VALUE: toStr(itemName),
                DEL: 'N',
                XML_ID: itemCodeStr,
                CODE: itemCodeStr,
                SORT: toNum(itemOrder),
            });
        });
        return items;
    }
}
