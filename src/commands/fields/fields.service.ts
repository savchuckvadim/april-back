
import { BitrixService } from 'src/modules/bitrix/';
import { BitrixEnumerationOption, IBXField } from 'src/modules/bitrix/';


export class FieldsService {
    constructor(
        private readonly bitrix: BitrixService
    ) {
    }

    async getDealFields() {

        const list = await this.bitrix.deal.getFieldsList({
            'SORT': 1,
           

        });

        const batchResult = await this.getDetailFields(list.result)
        const rowResults = this.bitrix.api.clearResult(batchResult) as IBXField[]
        const fields = this.prepareFields(rowResults)
        const filtredFields = fields.filter(field => field.name.includes('Участник 10'))
        return { count: filtredFields.length, filtredFields }
    }
    async getUserFieldsEnumeration() {

        const list = await this.bitrix.deal.getFieldsList({
            'USER_TYPE_ID': 'enumeration'
        });
        
        return await this.getDetailFields(list.result)

    }

    async getDetailFields(fieldList: IBXField[]) {

        for (const field of fieldList) {
            const cmdCode = `get_field_${field.ID}`
            this.bitrix.batch.deal.getField(cmdCode, field.ID);

        }
        const result = await this.bitrix.api.callBatchWithConcurrency(3);
        return result
    }

    private prepareFields(fields: IBXField[]) {
        const result = [] as any[]
        fields.map(field => {
            // result.push(field)

            result.push(this.prepareField(field))
        })
        return result
    }
    private prepareField(field: IBXField) {
        return {
            id: field.ID,
            bitrixId: field.FIELD_NAME,
            type: field.USER_TYPE_ID,
            list: field.LIST?.map(listItem => this.prepareFieldList(listItem)),
            name: field.EDIT_FORM_LABEL['ru'],
            code: field.XML_ID,
            multiple: field.MULTIPLE == 'Y',
            mandatory: field.MANDATORY == 'Y',


        }
    }
    private prepareFieldList(listItem: BitrixEnumerationOption) {
        return {
            bitrixId: listItem.ID,
            name: listItem.VALUE,
            sort: listItem.SORT,
        }
    }

}
