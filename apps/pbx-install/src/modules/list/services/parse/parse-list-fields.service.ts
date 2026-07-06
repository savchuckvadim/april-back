import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import {
    Field,
    FieldType,
    ListItem,
} from '@app/pbx-install/shared/parse-field-excel/type/parse-field.type';
import { coerceExcelBool, unwrapExcelCellValue } from '@app/pbx-install/shared';
import {
    ListFieldImportSheetRow,
    ListFieldItemImportSheetRow,
} from '../../type/list-sheet.type';

/**
 * Парсер листов `fields`/`fieldsItems` шаблона универсальных списков.
 *
 * Формат колонок отличается от смарт-шаблона (нет колонок «short type» и
 * «Значения Списка», есть isNeedUpdate/isActive), поэтому общий
 * ParseSmartFieldsService здесь не подходит.
 *
 * Семантика флагов: isActive=false — поле исключается из шаблона целиком,
 * isNeedUpdate — гейтинг установки (как у остальных сущностей).
 * Признак множественности — отдельный тип `multiple` (строковое поле
 * с isMultiple=true), других множественных типов в списках не бывает.
 */
@Injectable()
export class ParseListFieldsService {
    public getFieldsData(
        fieldsSheet: ExcelJS.Worksheet,
        fieldItemsSheet: ExcelJS.Worksheet,
    ): Field[] {
        const fields: Field[] = [];

        fieldsSheet.eachRow((row, index) => {
            if (index === 1) return; // Пропускаем заголовок (первую строку)
            const rawValues = row.values as unknown[];
            // Удаляем первый пустой элемент (ExcelJS вставляет пустой элемент в начале)
            const values = rawValues
                .slice(1)
                .map(
                    unwrapExcelCellValue,
                ) as unknown as ListFieldImportSheetRow;

            const [
                name,
                appType,
                type,
                code,
                bxFieldName,
                order,
                isNeedUpdate,
                isActive,
            ] = values;

            if (!name || !code || !bxFieldName) return;
            if (!coerceExcelBool(isActive, true)) return;

            const fieldType = type as FieldType;
            const list: ListItem[] =
                fieldType === 'enumeration'
                    ? this.getListItems(fieldItemsSheet, code)
                    : [];

            fields.push({
                name: String(name),
                appType: String(appType ?? ''),
                type: fieldType,
                list,
                code: String(code),
                bxFieldName: String(bxFieldName),
                order: Number(order),
                isNeedUpdate: coerceExcelBool(isNeedUpdate, true),
                isMultiple: fieldType === 'multiple',
            });
        });

        return fields;
    }

    private getListItems(
        fieldItemsSheet: ExcelJS.Worksheet,
        fieldCode: string,
    ): ListItem[] {
        const listArray: ListItem[] = [];

        fieldItemsSheet.eachRow((row, index) => {
            if (index === 1) return; // Пропускаем заголовок (первую строку)
            const rawValues = row.values as unknown[];
            // Удаляем первый пустой элемент (ExcelJS вставляет пустой элемент в начале)
            const values = rawValues
                .slice(1)
                .map(
                    unwrapExcelCellValue,
                ) as unknown as ListFieldItemImportSheetRow;

            const [
                itemName,
                itemFieldCode,
                itemCode,
                ,
                itemOrder,
                del,
                isActive,
            ] = values;

            if (itemFieldCode !== fieldCode) return;
            // Для enumeration в Bitrix нужны все активные элементы,
            // не только isNeedUpdate (см. ParseSmartFieldsService.getListItems).
            const isDeleted = String(del ?? '').toUpperCase() === 'Y';
            if (!coerceExcelBool(isActive, true) || isDeleted) return;

            listArray.push({
                VALUE: String(itemName),
                DEL: 'N',
                XML_ID: String(itemCode),
                CODE: String(itemCode),
                SORT: Number(itemOrder),
            });
        });

        return listArray;
    }
}
