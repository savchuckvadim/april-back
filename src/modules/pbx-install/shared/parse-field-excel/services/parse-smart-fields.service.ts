import { Field, ListItem } from '../type/parse-field.type';
import * as ExcelJS from 'exceljs';
import { PbxSalesEventFieldType } from '@/modules/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';
import { PbxSalesKonstructorFieldType } from '@/modules/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';
import {
    FieldItemImportSheetRow,
    SmartFieldImportSheetRow,
} from '../type/sheet-feild.type';
import { unwrapExcelCellValue } from '../../utils/unwrap-excel-cell.util';
import { Injectable } from '@nestjs/common';
import { PbxEntityType } from '@/shared';

/**
 * Service for parsing fields from excel file
 * единый сервис для преобразования данных из excel файла в массив типизированных объектов
 */
@Injectable()
export class ParseSmartFieldsService {
    constructor() {}
    public getFieldsData(
        fieldsSheet: ExcelJS.Worksheet,
        fieldItemsSheet: ExcelJS.Worksheet,
        entityType: PbxEntityType,
    ): Field[] {
        const fieldsData: SmartFieldImportSheetRow[] = [];
        fieldsSheet.eachRow((row, index) => {
            if (index === 1) return; // Пропускаем заголовок (первая строка)
            const rawValues = row.values as unknown[];
            // Удаляем первый пустой элемент (ExcelJS вставляет пустой элемент в начале)
            const fieldValues = rawValues
                .slice(1)
                .map(
                    unwrapExcelCellValue,
                ) as unknown as SmartFieldImportSheetRow;
            fieldsData.push(fieldValues);
        });

        const fields: Field[] = [];

        fieldsData.forEach(fieldValues => {
            const [name, appType, , type, , code, smart, order, multiple] =
                fieldValues;

            const fieldType:
                | PbxSalesEventFieldType
                | PbxSalesKonstructorFieldType = type as
                | PbxSalesEventFieldType
                | PbxSalesKonstructorFieldType;
            let listArray: ListItem[] = [];
            if (fieldType === 'enumeration') {
                listArray = this.getListItems(fieldItemsSheet, code);
            }
            const targetFieldCodeByEntityType = smart;
            if (targetFieldCodeByEntityType) {
                const field: Field = {
                    name,
                    appType,
                    type: fieldType,
                    list: listArray,
                    code,
                    bxFieldName: targetFieldCodeByEntityType,
                    order,
                    isNeedUpdate: true,
                    isMultiple: multiple?.toLowerCase() === 'true',
                };

                fields.push(field);
            }
        });

        return fields;
    }

    private getListItems(
        fieldItemsSheet: ExcelJS.Worksheet,
        code: string,
    ): ListItem[] {
        const listArray: ListItem[] = [];
        const itemsData: FieldItemImportSheetRow[] = [];

        fieldItemsSheet.eachRow((row, index) => {
            if (index === 1) return; // Пропускаем заголовок (первая строка)
            const rawValues = row.values as unknown[];
            // Удаляем первый пустой элемент (ExcelJS вставляет пустой элемент в начале)
            const itemValues = rawValues
                .slice(1)
                .map(
                    unwrapExcelCellValue,
                ) as unknown as FieldItemImportSheetRow;
            itemsData.push(itemValues);
        });

        itemsData.forEach(itemValues => {
            const [
                ,
                field_code,
                item_name,
                item_code,
                ,
                item_order,
                ,
                item_isActive,
                item_isNeedUpdate,
            ] = itemValues;

            if (field_code == code) {
                if (item_isNeedUpdate && item_isActive) {
                    listArray.push(
                        this.getListItem(
                            item_name,
                            item_code,
                            Number(item_order),
                        ),
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
            SORT: order,
        };
    }
}
