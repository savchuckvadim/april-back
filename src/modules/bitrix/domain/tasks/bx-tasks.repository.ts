import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { EBxMethod, EBxNamespace } from "../../core/domain/consts/bitrix-api.enum";
import { EBXEntity } from "../../core/domain/consts/bitrix-entities.enum";
import { IBXTask } from "../interfaces/bitrix.interface";
import { BXTaskRequest, BXTaskRequestFields } from "./bx-tasks.interface";
import { TBXResponse } from "../../core";
import { IBitrixResponse } from "../../core/interface/bitrix-api.intterface";


export class BxTasksRepository {
    constructor(private readonly bitrixService: BitrixBaseApi) { }

    async get(taskId: number) {
        return this.bitrixService.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.GET,
            { id: taskId }
        );
    }

    async getBtch(cmdCode: string, taskId: number | string) {
        return this.bitrixService.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.GET,
            { id: taskId, }
        );
    }

    async getList(filter: Partial<BXTaskRequestFields>, select?: string[]): Promise<IBitrixResponse<TBXResponse<EBxNamespace.TASKS, EBXEntity.TASK, EBxMethod.LIST>>> {
        return await this.bitrixService.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.LIST,
            { select, filter }
        );
    }

 

    async getListBtch(cmdCode: string, filter: Partial<BXTaskRequestFields>, select?: string[]) {
        return this.bitrixService.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.LIST,
            { select, filter }
        );
    }

    async getAll(filter: Partial<BXTaskRequestFields>, select?: string[]): Promise<{
        tasks: IBXTask[],
        total: number
    }> {
        let condition = true
        const results = [] as IBXTask[]
        let lastId = undefined as undefined | number | string
        while (condition) {
            const result = await this.bitrixService.callType(
                EBxNamespace.TASKS,
                EBXEntity.TASK,
                EBxMethod.LIST,
                {
                    select, filter: {
                        ...filter,
                        '>ID': lastId

                    }, order: { 'ID': 'asc' }
                }
            );
            if (result && result.result && result.result.tasks) {
                result.result.tasks.map(t => {
                    lastId = t.id
                    results.push(t)
                })
            }
            if (!result.total) {
                condition = false
            }
        }
        return {
            tasks: results,
            total: results.length
        }
    }


    async delete(taskId: number) {
        return this.bitrixService.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.DELETE,
            { id: taskId }
        );
    }

    async deleteBtch(cmdCode: string, taskId: number | string) {
        return this.bitrixService.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.DELETE,
            { id: taskId, }
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


    async update(taskId: number | string, data: { [key: string]: any }) {
        return this.bitrixService.callType(
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.UPDATE,
            { taskId, fields: data }
        );
    }

    async updateBtch(cmdCode: string, taskId: number | string, data: { [key: string]: any }) {
        return this.bitrixService.addCmdBatchType(
            cmdCode,
            EBxNamespace.TASKS,
            EBXEntity.TASK,
            EBxMethod.UPDATE,
            { taskId, fields: data }
        );
    }
}
