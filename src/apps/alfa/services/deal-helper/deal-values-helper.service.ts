import { IBXDeal } from "@/modules/bitrix";
import { DealField, DealFieldsTemplate, DealValueListItem, EnumerationField } from "../../type/deal-field.type";
import { BxDealDataKeys, TDealData } from "../../bx-data/bx-data";

// Интерфейс для значения поля сделки
export interface DealValue {
    code: string;
    bitrixId: string;
    name: string;
    value: string | number | boolean | DealValueListItem | DealValueListItem[];
    listItem?: DealValueListItem | DealValueListItem[];
}

export class DealFieldValuesHelperService {
    /**
     * Получает значения полей сделки на основе шаблона
     */
    public static getDealValues(deal: IBXDeal, fieldsTemplate: TDealData): DealValue[] {
        const values: DealValue[] = [];
        let fields = this.flattenFieldsTemplate(fieldsTemplate);

        fields = this.filterParticipants(fields, deal, fieldsTemplate)
        for (const field of fields) {
            const dealValue = deal[field.bitrixId] === '0' ? 'Нет' : deal[field.bitrixId] === '1' ? 'Да' : deal[field.bitrixId];

            if (this.isValidValue(dealValue)) {
                const result = this.createDealValue(field, dealValue);
                if (result) {
                    values.push(result);
                }
            }
        }
       
        return values;
    }
    private static filterParticipants(fields: DealField[], deal: IBXDeal, fieldsTemplate: TDealData): DealField[] {

        if (!deal[fieldsTemplate[BxDealDataKeys.participants][1].name.bitrixId]) {
            fields = fields.filter(field => (!field.name.includes('Участник 1') && field.name.includes('Участник 10')))
        }
        if (!deal[fieldsTemplate[BxDealDataKeys.participants][2].name.bitrixId]) {
            fields = fields.filter(field => (!field.name.includes('Участник 2')))
        }
        if (!deal[fieldsTemplate[BxDealDataKeys.participants][3].name.bitrixId]) {
            fields = fields.filter(field => (!field.name.includes('Участник 3')))
        }
        if (!deal[fieldsTemplate[BxDealDataKeys.participants][4].name.bitrixId]) {
            fields = fields.filter(field => (!field.name.includes('Участник 4')))
        }
        if (!deal[fieldsTemplate[BxDealDataKeys.participants][5].name.bitrixId]) {
            fields = fields.filter(field => (!field.name.includes('Участник 5')))
        }
        if (!deal[fieldsTemplate[BxDealDataKeys.participants][6].name.bitrixId]) {
            fields = fields.filter(field => (!field.name.includes('Участник 6')))
        }
        if (!deal[fieldsTemplate[BxDealDataKeys.participants][7].name.bitrixId]) {
            fields = fields.filter(field => (!field.name.includes('Участник 7')))
        }
        if (!deal[fieldsTemplate[BxDealDataKeys.participants][8].name.bitrixId]) {
            fields = fields.filter(field => (!field.name.includes('Участник 8')))
        }
        if (!deal[fieldsTemplate[BxDealDataKeys.participants][9].name.bitrixId]) {
            fields = fields.filter(field => (!field.name.includes('Участник 9')))
        }
        if (!deal[fieldsTemplate[BxDealDataKeys.participants][10].name.bitrixId]) {
            fields = fields.filter(field => (!field.name.includes('Участник 10')))
        }
        
        return fields
    }

    /**
     * Преобразует вложенный шаблон полей в плоский массив
     */
    private static flattenFieldsTemplate(template: TDealData): DealField[] {
        const fields: DealField[] = [];

        for (const [key, value] of Object.entries(template)) {
            if (this.isDealField(value)) {
                fields.push(value);
            } else if (typeof value === 'object') {
                fields.push(...this.flattenFieldsTemplate(value));
            }
        }

        return fields;
    }

    /**
     * Проверяет, является ли значение валидным
     */
    private static isValidValue(value: any): boolean {
        return value !== undefined &&
            value !== null &&
            !(Array.isArray(value) && value.length === 0);
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
     * Создает объект DealValue на основе поля и значения
     */
    private static createDealValue(field: DealField, dealValue: any): DealValue | null {
        if (!field.name) {
            console.log(`Missing name for field with bitrixId: ${field.bitrixId}`);
            return null;
        }

        const result: DealValue = {
            code: field.code || '',
            bitrixId: field.bitrixId,
            name: field.name,
            value: dealValue
        };

        if (this.isEnumerationField(field)) {
            this.processEnumerationField(field, result);
        }

        return result;
    }

    /**
     * Проверяет, является ли поле перечислением
     */
    private static isEnumerationField(field: DealField): field is EnumerationField {
        return field.type === 'enumeration' && 'list' in field;
    }

    /**
     * Обрабатывает поле типа перечисление
     */
    private static processEnumerationField(field: EnumerationField, result: DealValue): void {
        if (!field.multiple) {
            const listItem = field.list.find(item => item.bitrixId === result.value);
            if (listItem) {
                result.value = listItem.name;
                result.listItem = {
                    name: listItem.name,
                    bitrixId: listItem.bitrixId
                };
            }
        } else {
            const valueArray = Array.isArray(result.value) ? result.value : [];
            const listItems = field.list.filter(item =>
                valueArray.some(val => Number(val) === Number(item.bitrixId))
            );

            if (listItems.length > 0) {
                result.value = listItems.map(item => item.name).join(', ');
                result.listItem = listItems.map(item => ({
                    name: item.name,
                    bitrixId: item.bitrixId
                }));
            }
        }
    }
} 