import { BitrixBaseApi } from "src/modules/bitrix/core";
import { EBxMethod, EBxNamespace, EBXEntity, IBXField } from "src/modules/bitrix/";
import { IBXCompany } from "../interface/bx-company.interface";


export class BxCompanyRepository {
    constructor(
        private readonly bxApi: BitrixBaseApi

    ) { }

    async get(companyId: number) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.COMPANY,
            EBxMethod.GET,
            { ID: companyId, select: ['ID'] }
        );
    }

    async getBtch(cmdCode: string, companyId: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.COMPANY,
            EBxMethod.GET,
            { ID: companyId, select: ['ID'] }
        );
    }

    async getList(filter: Partial<IBXCompany>, select?: string[]) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.COMPANY,
            EBxMethod.LIST,
            { select, filter, start:  -1 }
        );
    }

    async getListBtch(cmdCode: string, filter: Partial<IBXCompany>, select?: string[]) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.COMPANY,
            EBxMethod.LIST,
            { select, filter, start: -1 }
        );
    }
    //     field_n — название поля, по которому будет отфильтрована выборка элементов
    // value_n — значение фильтра
    // К ключам field_n можно добавить префикс, уточняющий работу фильтра.
    // Возможные значения префикса:

    // >= — больше либо равно
    // > — больше
    // <= — меньше либо равно
    // < — меньше
    // @ — IN, в качестве значения передается массив
    // !@ — NOT IN, в качестве значения передается массив
    // % — LIKE, поиск по подстроке. Символ % в значении фильтра передавать не нужно. Поиск ищет подстроку в любой позиции строки
    // =% — LIKE, поиск по подстроке. Символ % нужно передавать в значении. Примеры:
    // "мол%" — ищет значения, начинающиеся с «мол»
    // "%мол" — ищет значения, заканчивающиеся на «мол»
    // "%мол%" — ищет значения, где «мол» может быть в любой позиции
    // %= — LIKE (аналогично =%)
    // = — равно, точное совпадение (используется по умолчанию)
    // != — не равно
    // ! — не равно
    // Фильтр LIKE не работает с полями типа crm_status, crm_contact, crm_company (тип сделки TYPE_ID, стадия STAGE_ID и так далее).

    async set(data: Partial<IBXCompany>) { // Consider using Partial<IBXCompany> or a more specific DTO if possible
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.COMPANY,
            EBxMethod.ADD,
            { fields: data }
        );
    }

    async setBtch(cmdCode: string, data: Partial<IBXCompany> ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.COMPANY,
            EBxMethod.ADD,
            { fields: data }
        )
    }
    async update(id: number | string, data: Partial<IBXCompany>) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.COMPANY,
            EBxMethod.UPDATE,
            { id: id, fields: data }
        );
    }

    async updateBtch(cmdCode: string, id: number | string, data: Partial<IBXCompany>) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.COMPANY,
            EBxMethod.UPDATE,
            { id: id, fields: data }
        );
    }

    async getFieldList(filter: { [key: string]: any }, select?: string[]) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.DEAL,
            EBxMethod.USER_FIELD_LIST,
            { select, filter }
        );
    }

    async getField(id: number | string) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.COMPANY,
            EBxMethod.USER_FIELD_GET,
            { id, select: ['ID', 'USER_TYPE_ID', 'FIELD_NAME', 'MULTIPLE', 'EDIT_FORM_LABEL', 'LIST'] }
        );
    }

    async getFieldBtch(cmdCode: string, id: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.COMPANY,
            EBxMethod.USER_FIELD_GET,
            { id, select: ['ID', 'USER_TYPE_ID', 'FIELD_NAME', 'MULTIPLE', 'EDIT_FORM_LABEL', 'LIST'] }
        );
    }

    async setField(fields: Partial<IBXField>) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.COMPANY,
            EBxMethod.USER_FIELD_ADD,
            {fields}
        );
    }

    async setFieldBtch(cmdCode: string, fields: Partial<IBXField>) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.COMPANY,
            EBxMethod.USER_FIELD_ADD,
            {fields}
        );
    }
} 