import { Injectable, NotFoundException } from "@nestjs/common";
import { PBXService } from "@pbx";
import { OrkFields, OrkFieldsMetadata } from "./type/ork-list-history.type";

@Injectable()
export class KpiReportOrkEventService {
    constructor(
        private readonly pbx: PBXService
    ) { }

    async getReport(domain: string) {
        const { bitrix, PortalModel: portal } = await this.pbx.init(domain)
        const pbxList = portal.getListByCode('ork_history')
        if (!pbxList) {
            throw new NotFoundException('List not found');
        }
        // const fields = portal.getListFieldsSelectAll(pbxList)
        if (!pbxList.bitrixfields) return []
        for (const field of pbxList.bitrixfields) {
            if (field.code === OrkFields.author.code) {
                const authorBitrixId = field.bitrixId

            }
        }

        Object.values(OrkFields).forEach(field => {
            if (field.code === OrkFields.ork_event_action.code) {
                Object.values(OrkFields.ork_event_action.items).forEach(item => {
                    OrkFields.ork_event_action.name
                    //ВСЕ КОДЫ СОБЫТИЙ
                    console.log(item)
                })
            }
        })

        Object.values(OrkFields).forEach(field => {
            if (field.code === OrkFields.ork_event_type.code) {

                Object.values(OrkFields.ork_event_type.items).forEach(item => {
                    OrkFields.ork_event_type.name
                    //ВСЕ КОДЫ Тип События
                    console.log(item)
                })
            }
        })

        // const response = await bitrix.batch. //todo list

        
        //получить по каждому сотрудгику за период
        // результативных коммуникаций
        // сервисных сигналов создано-отработано
        //
        return [];
    }
}   