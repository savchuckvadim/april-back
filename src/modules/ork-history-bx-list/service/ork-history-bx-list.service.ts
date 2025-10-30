import { PBXService } from "@/modules/pbx";
import { EnumOrkEventAction, EnumOrkEventType, EnumOrkFieldCode } from "../type/ork-list-history.enum";
import { IPBXList } from "@/modules/portal/interfaces/portal.interface";
import { OrkFieldsType, OrkFieldValue } from "../type/ork-list-history.type";
import { PortalModel } from "@/modules/portal/services/portal.model";
import { OrkHistoryFieldValueDto, OrkHistoryFieldItemValueDto, OrkListHistoryItemDto } from "../dto/ork-list-history.dto";


export class OrkHistoryBxListItemDto {
    type: EnumOrkEventType
    action: EnumOrkEventAction
    responsibleId: number
    elementCode: string
    companyId: number
    dealId: number
    comment?: string
}
export type OrkFieldsInput = {
    [K in keyof OrkFieldsType]?: OrkFieldValue<K>;
};
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
        const fields = this.getFields(dto, portalList);

        const addListItemData = {
            IBLOCK_TYPE_ID: 'lists',
            IBLOCK_CODE: portalListType,
            ELEMENT_CODE: dto.elementCode,
            FIELDS: {
                NAME: 'Перезаключение',
                ...fields
            }
        }
        void await bitrix.api.call('lists.element.add', addListItemData)

        return portalList;
    }
    private getFields(dto: OrkHistoryBxListItemDto, portalList: IPBXList) {

        const fields: Record<string, string | string[]> = {}
        portalList.bitrixfields?.map(field => {
            const fieldCode = field.code as EnumOrkFieldCode;
            if (fieldCode === EnumOrkFieldCode.responsible) {

                fields[field.bitrixCamelId] = dto.responsibleId.toString()

            } else if (fieldCode === EnumOrkFieldCode.ork_event_action) {

                fields[field.bitrixCamelId] = dto.action.toString()

            } else if (fieldCode === EnumOrkFieldCode.ork_event_type) {

                fields[field.bitrixCamelId] = dto.type.toString()

            } else if (fieldCode === EnumOrkFieldCode.crm) {
                fields[field.bitrixCamelId] = [`CO_${dto.companyId}`, `D_${dto.dealId}`]
            } else if (fieldCode === EnumOrkFieldCode.manager_comment && dto.comment) {
                fields[field.bitrixCamelId] = dto.comment
            }
        })
        return fields
    }


    async getAllItems(domain: string, filter: OrkFieldsInput) {
        const { bitrix, PortalModel } = await this.pbx.init(domain);
        const portalListType = ORK_HISTORY_LIST.CODE;
        const portalList = PortalModel.getListByCode(portalListType);
        if (!portalList || !portalList.bitrixId) {
            throw new Error('List not found or bitrixId not found');
        }
        const filterForBitrix = this.getFilter(PortalModel, portalList, filter);
        console.log('filterForBitrix');
        console.log(filterForBitrix);
        const listItems = await bitrix.listItem.all(
            {
                IBLOCK_ID: portalList.bitrixId.toString(),
                filter: filterForBitrix
            }
        )

        return this.prepareResponse(portalList, listItems);
    }

    async *getAllItemsStream(domain: string, filter: OrkFieldsInput) {
        const { bitrix, PortalModel } = await this.pbx.init(domain);
        const portalListType = ORK_HISTORY_LIST.CODE;
        const portalList = PortalModel.getListByCode(portalListType);
        if (!portalList || !portalList.bitrixId) {
            throw new Error('List not found or bitrixId not found');
        }
        const filterForBitrix = this.getFilter(PortalModel, portalList, filter);
        console.log('filterForBitrix');
        console.log(filterForBitrix);
        for await (const batch of bitrix.listItem.allStream(
            {
                IBLOCK_ID: portalList.bitrixId.toString(),
                filter: filterForBitrix
            }
        )) {
            yield this.prepareResponse(portalList, batch);
        }

    }
    protected getFilter(PortalModel: PortalModel, portalList: IPBXList, filter: OrkFieldsInput): Record<string, any> {
        let result: Record<string, any> = {};
        for (const key in filter) {
            const fieldCode = filter[key as keyof OrkFieldsInput];
            const pField = portalList.bitrixfields?.find(field => field.code === key);
            if (!pField) {
                continue;
            }
            const bitrixId = pField.bitrixCamelId;
            if (!bitrixId) {
                continue;
            }
            const itemCodeOrValue = filter[key as keyof OrkFieldsType]

            if (!itemCodeOrValue) {
                continue;
            }
            if (pField.type === 'select') {
                const pItem = PortalModel.getIdByCodeFieldList(portalList, itemCodeOrValue as string);
                if (!pItem) {
                    continue;
                }
                const pItemBitrixId = pItem.bitrixId;
                if (!pItemBitrixId) {
                    continue;
                }

                result = {
                    ...result,
                    [bitrixId]: pItemBitrixId
                }

            } else {
                result = {
                    ...result,
                    [bitrixId]: itemCodeOrValue
                };
            }
        }
        return result;
    }

    protected prepareResponse(portalList: IPBXList, listItems: Record<string, any>[]) {
        // ID: '834833',
        // IBLOCK_ID: '93',
        // NAME: 'Обучение\n Запланирован',
        // IBLOCK_SECTION_ID: null,
        // CREATED_BY: '187',
        // BP_PUBLISHED: 'Y',
        // CODE: 'service_661_ork_history_838',
        // PROPERTY_1123: { '11223077': 'Обучение\n Запланирован' },
        // PROPERTY_1125: { '11223079': '79753' },
        // PROPERTY_1127: { '11223081': '27.03.2025 11:11:27' },
        // PROPERTY_1129: { '11223083': '3387' },
        // PROPERTY_1131: { '11223085': '3175' },
        // PROPERTY_1133: { '11223087': '3195' },
        // PROPERTY_1135: { '11223089': '3207' },
        // PROPERTY_1137: { '11223091': '1' },
        // PROPERTY_1143: { '11223093': '04.04.2025 11:10:00' },
        // PROPERTY_1145: { '11223095': '123' },
        // PROPERTY_1157: { '11223097': '1' },
        // PROPERTY_1159: { '11223099': '1' },
        // PROPERTY_1161: { '11223101': 'CO_79753', '11223103': 'D_74731' }

        return listItems.map(item => {
            const resultItem = {
                id: item.ID,
                title: item.NAME,
                // comapny: null,
                // companyId: null,
                // dealId: null,
                // author: null,
                // su: null,
                // communication: item.PROPERTY_1157[0],
                // initiative: item.PROPERTY_1159[0],

                // event_tag: null,
            } as OrkListHistoryItemDto

            for (const keyFieldBitrixId in item) {
                const pField = portalList.bitrixfields?.find(field => field.bitrixCamelId === keyFieldBitrixId);
                if (!pField) {
                    continue;
                }

                const currentValue = item[keyFieldBitrixId] as Record<string, string | number> | string;
                if (!currentValue || typeof currentValue === 'string') {
                    continue;
                }
                const fieldCode = pField.code as EnumOrkFieldCode;
                for (const key in currentValue) {
                    const pItem = pField.items?.find(item => Number(item.bitrixId) === Number(currentValue[key]));
                    if (pItem) {
                        resultItem[fieldCode] = {
                            fieldName: pField.name,
                            fieldCode: pField.code,
                            bitrixId: pField.bitrixId,
                            value: {
                                id: pItem.id,
                                bitrixId: pItem.bitrixId,
                                name: pItem.name,
                                code: pItem.code,
                            } as OrkHistoryFieldItemValueDto
                        } as OrkHistoryFieldValueDto;



                    }
                }

            }
            return new OrkListHistoryItemDto(resultItem);
        })

    }


}
