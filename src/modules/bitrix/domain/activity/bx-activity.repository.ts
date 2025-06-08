import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { EBxMethod, EBxNamespace } from "../../core/domain/consts/bitrix-api.enum";
import { EBXEntity } from "../../core/domain/consts/bitrix-entities.enum";
import { IBXTask } from "../interfaces/bitrix.interface";
import { TBXResponse } from "../../core";
import { IBitrixResponse } from "../../core/interface/bitrix-api.intterface";
import {  BXActivityRequestFields, IBXActivity } from "./interfaces/bx-activity.interface";


export class BxActivityRepository {
    constructor(private readonly bitrixService: BitrixBaseApi) { }

    async get(id: number) {
        return this.bitrixService.callType(
            EBxNamespace.CRM,
            EBXEntity.ACTIVITY,
            EBxMethod.GET,
            { id }
        );
    }

    async getBtch(cmdCode: string, activityId: number | string) {
        return this.bitrixService.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.ACTIVITY,
            EBxMethod.GET,
            { id: activityId, }
        );
    }

    async getList(filter: Partial<BXActivityRequestFields>, select?: string[]): Promise<IBitrixResponse<TBXResponse<EBxNamespace.CRM, EBXEntity.ACTIVITY, EBxMethod.LIST>>> {
        return await this.bitrixService.callType(
            EBxNamespace.CRM,
            EBXEntity.ACTIVITY,
            EBxMethod.LIST,
            { select, filter }
        );
    }



    async getListBtch(cmdCode: string, filter: Partial<BXActivityRequestFields>, select?: string[]) {
        return this.bitrixService.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.ACTIVITY,
            EBxMethod.LIST,
            { select, filter }
        );
    }

    async getAll(filter: Partial<BXActivityRequestFields>, select?: string[]): Promise<{
        activities: IBXActivity[],
        total: number
    }> {
        let condition = true
        const results = [] as IBXActivity[]
        let lastId = undefined as undefined | number | string
        while (condition) {
            const result = await this.bitrixService.callType(
                EBxNamespace.CRM,
                EBXEntity.ACTIVITY,
                EBxMethod.LIST,
                {
                    select, filter: {
                        ...filter,
                        '>ID': lastId

                    }, order: { 'ID': 'asc' }
                }
            );
            if (result && result.result) {
                result.result.map(t => {
                    lastId = t.id
                    results.push(t)
                })
            }
            if (!result.total) {
                condition = false
            }
        }
        return {
            activities: results,
            total: results.length
        }
    }


    async delete(activityId: number | string) {
        return this.bitrixService.callType(
            EBxNamespace.CRM,
            EBXEntity.ACTIVITY,
            EBxMethod.DELETE,
            { id: activityId }
        );
    }

    async deleteBtch(cmdCode: string, activityId: number | string) {
        return this.bitrixService.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.ACTIVITY,
            EBxMethod.DELETE,
            { id: activityId, }
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

    // async setDeal(data: { [key: string]: any }) {
    //     return this.bitrixService.callType(
    //         EBxNamespace.CRM,
    //         EBXEntity.DEAL,
    //         EBxMethod.ADD,
    //         { fields: data }
    //     );
    // }

    async create(data:  Partial<IBXActivity>) {
        return this.bitrixService.callType(
            EBxNamespace.CRM,
            EBXEntity.ACTIVITY,
            EBxMethod.ADD,
            { fields: data }
        );
    }
    async createBtch(cmdCode: string, data:  Partial<IBXActivity>) {
        return this.bitrixService.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.ACTIVITY,
            EBxMethod.ADD,
            { fields: data }
        );
    }
    async update(id: number | string, data: Partial<IBXActivity>) {
        return this.bitrixService.callType(
            EBxNamespace.CRM,
            EBXEntity.ACTIVITY,
            EBxMethod.UPDATE,
            { id, fields: data }
        );
    }

    async updateBtch(cmdCode: string, id: number | string, data: Partial<IBXActivity>) {
        return this.bitrixService.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.ACTIVITY,
            EBxMethod.UPDATE,
            { id, fields: data }
        );
    }
}
