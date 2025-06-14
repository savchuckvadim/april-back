import { Injectable } from '@nestjs/common';
import { AlfaBxField } from '../../type/bx-deal-field.type';
import { dealData } from '../../bx-data/bx-data';
import { DealField, DealFieldsTemplate } from '../../type/deal-field.type';

@Injectable()
export class DealFieldHelperService {
    /**
     * Обновляет шаблон полей сделки на основе ответа от Bitrix
     */
    public static updateDealDataFromBitrixResponse(bitrixResponse: AlfaBxField[]): DealFieldsTemplate {
        const updatedDealData = this.createDeepCopy(dealData);
        this.updateFields(updatedDealData, bitrixResponse);
        return updatedDealData;
    }

    /**
     * Получает список ID полей для выборки
    */
    public static getBxFieldsIdsForSelect(data: DealFieldsTemplate): string[] {
        const bxFieldsIds = ['ID', 'NAME'] as string[];
        const fields = this.flattenFieldsTemplate(data);

        for (const field of fields) {
            if (this.isDealField(field)) {
                bxFieldsIds.push(field.bitrixId);
            }
        }

        return bxFieldsIds;
    }

    /**
     * Создает глубокую копию объекта
     */
    private static createDeepCopy<T>(obj: T): T {
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * Обновляет поля в шаблоне на основе ответа от Bitrix
     */
    private static updateFields(template: DealFieldsTemplate, bitrixFields: AlfaBxField[]): void {
        const fields = this.flattenFieldsTemplate(template);

        for (const field of fields) {
            if (this.isDealField(field)) {
                this.updateField(field, bitrixFields);
            }
        }
    }

    /**
     * Преобразует вложенный шаблон полей в плоский массив
     */
    private static flattenFieldsTemplate(template: DealFieldsTemplate): (DealField | DealFieldsTemplate)[] {
        const result: (DealField | DealFieldsTemplate)[] = [];

        for (const value of Object.values(template)) {
            if (this.isDealField(value)) {
                result.push(value);
            } else if (typeof value === 'object') {
                result.push(...this.flattenFieldsTemplate(value));
            }
        }

        return result;
    }

    /**
     * Проверяет, является ли объект полем сделки
     */
    private static isDealField(obj: any): obj is DealField {
        return obj &&
            typeof obj === 'object' &&
            'bitrixId' in obj &&
            'name' in obj;
    }

    /**
     * Обновляет отдельное поле на основе данных из Bitrix
     */
    private static updateField(field: DealField, bitrixFields: AlfaBxField[]): void {
        const bitrixField = bitrixFields.find(f => f.bitrixId === field.bitrixId);
        if (bitrixField) {
            this.updateFieldProperties(field, bitrixField);
        }
    }

    /**
     * Обновляет свойства поля на основе данных из Bitrix
     */
    private static updateFieldProperties(field: DealField, bitrixField: AlfaBxField): void {
        if (bitrixField.name) {
            (field as any).name = bitrixField.name;
        }

        if (this.isEnumerationField(field) && bitrixField.list) {
            this.updateEnumerationList(field, bitrixField.list);
        }
    }

    /**
     * Проверяет, является ли поле перечислением
     */
    private static isEnumerationField(field: DealField): field is DealField & { type: 'enumeration' } {
        return field.type === 'enumeration' && 'list' in field;
    }

    /**
     * Обновляет список значений для поля перечисления
     */
    private static updateEnumerationList(field: DealField & { type: 'enumeration' }, list: NonNullable<AlfaBxField['list']>): void {
        (field as any).list = list.map(item => ({
            name: item.name,
            bitrixId: item.bitrixId,
            sort: item.sort
        }));
    }


}