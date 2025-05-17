import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { EBxMethod, EBxNamespace } from "../../../core/domain/consts/bitrix-api.enum";
import { EBXEntity } from "../../../core/domain/consts/bitrix-entities.enum";
import { IBXDeal } from "../../interfaces/bitrix.interface";


export class BxDealRepository {
    constructor(private readonly bitrixService: BitrixBaseApi) { }

    async getDeal(dealId: number) {
        return this.bitrixService.callType(
            EBxNamespace.CRM,
            EBXEntity.DEAL,
            EBxMethod.GET,
            { ID: dealId, select: ['ID'] }
        );
    }

    async getDealBtch( cmdCode: string, dealId: number | string) {
        return this.bitrixService.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.DEAL,
            EBxMethod.GET,
            { ID: dealId, select: ['ID', 'UF_CRM_UC_ID'] }
        );
    }

    async getDealList(filter: Partial<IBXDeal>, select?: string[]) {
        return this.bitrixService.callType(
            EBxNamespace.CRM,
            EBXEntity.DEAL,
            EBxMethod.LIST,
            { select, filter }
        );
    }

    async getDealListBtch( cmdCode: string, filter: Partial<IBXDeal>, select?: string[]) {
        return this.bitrixService.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.DEAL,
            EBxMethod.LIST,
            { select, filter }
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

    async setDeal(data: { [key: string]: any }) {
        return this.bitrixService.callType(
            EBxNamespace.CRM,
            EBXEntity.DEAL,
            EBxMethod.ADD,
            { fields: data }
        );
    }

    
    async updateDeal(dealId: number | string, data: { [key: string]: any }) {
        return this.bitrixService.callType(
            EBxNamespace.CRM,
            EBXEntity.DEAL,
            EBxMethod.UPDATE,
            { id: dealId, fields: data }
        );
    }

    async updateDealBtch(cmdCode: string, dealId: number | string, data: { [key: string]: any }) {
        return this.bitrixService.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.DEAL,
            EBxMethod.UPDATE,
            { id: dealId, fields: data }
        );
    }
}
