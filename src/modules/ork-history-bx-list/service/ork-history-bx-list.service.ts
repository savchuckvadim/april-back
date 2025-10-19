import { PBXService } from "@/modules/pbx";
import { EnumOrkEventAction, EnumOrkEventType, EnumOrkFieldCode } from "../type/ork-list-history.enum";
import { IPBXList } from "@/modules/portal/interfaces/portal.interface";


export class OrkHistoryBxListItemDto {
    type: EnumOrkEventType
    action: EnumOrkEventAction
    responsibleId: number
    elementCode: string
    companyId: number
    dealId: number
    comment?: string
}
export enum ORK_HISTORY_LIST {
    CODE = 'service_ork_history'
}
export class OrkHistoryBxListService {
    constructor(private readonly pbx: PBXService) { }

    async setOrkHistoryBxListItem(domain: string, dto: OrkHistoryBxListItemDto) {
        const { bitrix, PortalModel } = await this.pbx.init(domain);
        const portalListType = ORK_HISTORY_LIST.CODE;
        const portalList = PortalModel.getListByCode(portalListType);
        if (!portalList) {
            throw new Error('List not found');
        }

        const addListItemData = {
            IBLOCK_TYPE_ID: 'lists',
            IBLOCK_CODE: portalListType,
            ELEMENT_CODE: dto.elementCode,
            FIELDS: this.getFields(dto, portalList)
        }
        void await bitrix.api.call('lists.element.add', addListItemData)

        return portalList;
    }
    private getFields(dto: OrkHistoryBxListItemDto, portalList: IPBXList) {

        const fields = portalList.bitrixfields?.map(field => {
            const fieldCode = field.code as EnumOrkFieldCode;
            if (fieldCode === EnumOrkFieldCode.responsible) {
                return {
                    [field.bitrixId]: dto.responsibleId.toString()
                }
            } else if (fieldCode === EnumOrkFieldCode.ork_event_action) {
                return {
                    [field.bitrixId]: dto.action.toString()
                }
            } else if (fieldCode === EnumOrkFieldCode.ork_event_type) {
                return {
                    [field.bitrixId]: dto.type.toString()
                }
            } else if (fieldCode === EnumOrkFieldCode.crm) {
                return {
                    [field.bitrixId]: [`CO_${dto.companyId}`, `D_${dto.dealId}`]
                }
            }else if (fieldCode === EnumOrkFieldCode.manager_comment && dto.comment) {
                return {
                    [field.bitrixId]: dto.comment
                }
            }
        })
        return fields
    }
}
