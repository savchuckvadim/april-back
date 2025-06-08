// import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { EBxMethod, EBxNamespace } from "../../../../core/domain/consts/bitrix-api.enum";
import { EBXEntity } from "../../../../core/domain/consts/bitrix-entities.enum";
import { IBXDeal } from "../interface/bx-deal.interface";

export class BxDealRepository {
    // private bxApi: BitrixBaseApi;
    constructor(
        private readonly bxApi: BitrixBaseApi
    ) {
        // this.bxApi = this.bxApiFactoryService.getBitrixApi();
    }

    async get(dealId: number, select?: string[]) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.DEAL,
            EBxMethod.GET,
            { ID: dealId, select }
        );
    }

    async getBtch(cmdCode: string, dealId: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.DEAL,
            EBxMethod.GET,
            { ID: dealId, select: ['ID', 'UF_CRM_UC_ID'] }
        );
    }

    async getList(filter: Partial<IBXDeal>, select?: string[], order?: { [key in keyof IBXDeal]?: 'asc' | 'desc' | 'ASC' | 'DESC' }) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.DEAL,
            EBxMethod.LIST,
            { select, filter, order }
        );
    }

    async getListBtch(cmdCode: string, filter: Partial<IBXDeal>, select?: string[], order?: { [key in keyof IBXDeal]?: 'asc' | 'desc' | 'ASC' | 'DESC' }) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.DEAL,
            EBxMethod.LIST,
            { select, filter, order }
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

    // Список до

    async set(data: Partial<IBXDeal>) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.DEAL,
            EBxMethod.ADD,
            { fields: data }
        );
    }
    async setBtch(cmdCode: string, data: Partial<IBXDeal>) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.DEAL,
            EBxMethod.ADD,
            { fields: data }
        );
    }

    async update(dealId: number | string, data: Partial<IBXDeal>) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.DEAL,
            EBxMethod.UPDATE,
            { id: dealId, fields: data }
        );
    }

    async updateBtch(cmdCode: string, dealId: number | string, data: Partial<IBXDeal>) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.DEAL,
            EBxMethod.UPDATE,
            { id: dealId, fields: data }
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
            EBXEntity.DEAL,
            EBxMethod.USER_FIELD_GET,
            { id, select: ['ID', 'USER_TYPE_ID', 'FIELD_NAME', 'MULTIPLE', 'EDIT_FORM_LABEL', 'LIST'] }
        );
    }

    async getFieldBtch(cmdCode: string, id: number | string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.DEAL,
            EBxMethod.USER_FIELD_GET,
            { id, select: ['ID', 'USER_TYPE_ID', 'FIELD_NAME', 'MULTIPLE', 'EDIT_FORM_LABEL', 'LIST'] }
        );
    }

    async contactItemsSet(dealId: number | string, contactIds: number[] | string[]) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.DEAL,
            EBxMethod.CONTACT_ITEMS_SET,
            { id: dealId, items: contactIds.map(id => ({ CONTACT_ID: id })) }
        );
    }
    async contactItemsSetBtch(cmdCode: string, dealId: number | string, contactIds: number[] | string[]) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.DEAL,
            EBxMethod.CONTACT_ITEMS_SET,
            { id: dealId, items: contactIds.map((id: number | string) => ({ CONTACT_ID: id })) }
        );
    }

}
