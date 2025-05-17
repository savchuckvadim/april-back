import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { EBxMethod, EBxNamespace } from "../../../core/domain/consts/bitrix-api.enum";
import { EBXEntity } from "../../../core/domain/consts/bitrix-entities.enum";
import { IBXCompany } from "../../interfaces/bitrix.interface";


export class BxCompanyRepository {
    constructor(private readonly bitrixService: BitrixBaseApi) { }

    async getCompany(companyId: number) {
        return this.bitrixService.callType(
            EBxNamespace.CRM,
            EBXEntity.COMPANY,
            EBxMethod.GET,
            { ID: companyId, select: ['ID'] }
        );
    }

    async getCompanyBtch(cmdCode: string, companyId: number) {
        return this.bitrixService.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.COMPANY,
            EBxMethod.GET,
            { ID: companyId, select: ['ID'] }
        );
    }

    async getCompanyList(filter: Partial<IBXCompany>, select?: string[]) {
        return this.bitrixService.callType(
            EBxNamespace.CRM,
            EBXEntity.COMPANY,
            EBxMethod.LIST,
            { select, filter }
        );
    }

    async getCompanyListBtch(cmdCode: string, filter: Partial<IBXCompany>, select?: string[]) {
        return this.bitrixService.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.COMPANY,
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

    async setCompany(data: { [key: string]: any }) { // Consider using Partial<IBXCompany> or a more specific DTO if possible
        return this.bitrixService.callType(
            EBxNamespace.CRM,
            EBXEntity.COMPANY,
            EBxMethod.ADD,
            { fields: data }
        );
    }

    async updateCompany(id: number, data: Partial<IBXCompany>) {
        return this.bitrixService.callType(
            EBxNamespace.CRM,
            EBXEntity.COMPANY,
            EBxMethod.UPDATE,
            { id: id, fields: data }
        );
    }
} 