import { BitrixService } from "@/modules/bitrix";
import { PBXService } from "@/modules/pbx";
import { SalesUserReportGetRequestDto } from "../dto/sales-user-report.dto";
import { Injectable } from "@nestjs/common";
import { IPBXList } from "@/modules/portal/interfaces/portal.interface";
import { PortalModel } from "@/modules/portal/services/portal.model";
import { EnumOrkFieldCode, OrkFieldsType } from "@/modules/ork-history-bx-list";
import { OrkHistoryFieldItemValueDto, OrkHistoryFieldValueDto, OrkListHistoryItemDto } from "@/modules/ork-history-bx-list/dto/ork-list-history.dto";
import { delay } from "@/lib";
import { BxListItemGetRequestDto } from "@/modules/bitrix/domain/list-item";

@Injectable()
export class SalesUserReportService {
    constructor(
        private readonly pbx: PBXService,


    ) {
    }

    public async *getReport(dto: SalesUserReportGetRequestDto) {

        const { domain, socketId, userId, dateFrom, dateTo } = dto;
        const { bitrix, portal, PortalModel } = await this.pbx.init(domain);
        const portalKPIList = PortalModel.getListByCode('sales_kpi');
        if (!portalKPIList) throw new Error('Portal KPI list not found');



        const filterForBitrix = this.getFilter(PortalModel, portalKPIList, {
            [EnumOrkFieldCode.responsible]: userId.toString(),
            [EnumOrkFieldCode.ork_event_date]: dateFrom,
            [EnumOrkFieldCode.ork_plan_date]: dateTo,

            // ork_event_date: dateFrom.toISOString(),
            // ork_plan_date: dateTo.toISOString(),
        } as Record<EnumOrkFieldCode, any>);



        for await (const batch of this.getAllItems(filterForBitrix, bitrix, portalKPIList)) {
            yield batch;
        }

        // for await (const batch of this.orkHistoryListService.getAllItemsStream(domain, {
        //     responsible: userId.toString(),
        //     // ork_event_date: dateFrom.toISOString(),
        //     // ork_plan_date: dateTo.toISOString(),
        // })) {
        //     yield batch;
        // }



    }
    private async *getAllItems(filterForBitrix: Record<string, any>, bitrix: BitrixService, portalList: IPBXList) {


        for await (const batch of this.all({
            IBLOCK_ID: portalList.bitrixId.toString(),
            filter: filterForBitrix
        }, bitrix)) {
            const preparedResult = this.prepareResponse(portalList, batch);
            yield preparedResult;
        }
    }


    // ⚡ Асинхронный генератор — по батчам
    private async *all(dto: BxListItemGetRequestDto, bitrix: BitrixService) {

        let needMore = true;
        let nextId = 0;
        let batchCount = 0;
        while (needMore) {
            dto.filter = {
                ...dto.filter,
                '>ID': nextId,
            };
            const { result } = await bitrix.listItem.get(dto);

            if (result.length === 0) {
                break;
            }
            nextId = result[result.length - 1]?.ID ?? 0;
            if (nextId === 0) {
                needMore = false;
            }

            yield result;
            if ((batchCount + 1) % 3 === 0) {
                await delay(900);
                batchCount = 0;
            }
            batchCount++;
        }

    }
    protected getFilter(PortalModel: PortalModel, portalList: IPBXList, filter: Record<EnumOrkFieldCode, any>): Record<string, any> {
        let result: Record<string, any> = {};
        for (const key in filter) {
            const code = key === EnumOrkFieldCode.ork_plan_date ? EnumOrkFieldCode.ork_event_date : key;

         
            const pField = portalList.bitrixfields?.find(field => field.code === code);

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
            if (pField.type === 'select' ||
                key === EnumOrkFieldCode.event_communication ||
                key === EnumOrkFieldCode.ork_event_action ||
                key === EnumOrkFieldCode.ork_event_type ||
                key === EnumOrkFieldCode.ork_event_initiative


            ) {
                // console.log('select pField')
                // console.log(key)
                // console.log(pField)
                // console.log('--------------------------------')
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

            } else if (key === EnumOrkFieldCode.ork_plan_date) {
                result = {
                    ...result,
                    ['<' + bitrixId]: itemCodeOrValue
                };
                console.log(result)

            } else if (key === EnumOrkFieldCode.ork_event_date) {
                result = {
                    ...result,
                    ['>' + bitrixId]: itemCodeOrValue
                };
                console.log(result)

            }
            else {
                result = {
                    ...result,
                    [bitrixId]: itemCodeOrValue
                };
            }
        }
        return result;
    }

    protected prepareResponse(portalList: IPBXList, listItems: Record<string, any>[]) {


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
                if (!currentValue) {
                    continue;
                }
                const fieldCode = pField.code as EnumOrkFieldCode;
                if (
                    pField.code === EnumOrkFieldCode.manager_comment ||
                    pField.code === EnumOrkFieldCode.ork_plan_date ||
                    pField.code === EnumOrkFieldCode.ork_event_date ||
                    pField.code === EnumOrkFieldCode.ork_crm_company ||
                    pField.code === EnumOrkFieldCode.ork_crm_contact ||


                    pField.code === EnumOrkFieldCode.ork_evemt_tag
                ) {

                    let currentCommentStringValue = ''

                    for (const key in currentValue as Record<string, string>) {
                        currentCommentStringValue += currentValue[key]
                        if (pField.code === EnumOrkFieldCode.ork_crm_company) {

                            currentCommentStringValue = currentCommentStringValue
                                .toString()
                                .replace(/\D/g, '') as string;

                        }
                    }

                    resultItem[fieldCode] = {
                        fieldName: pField.name,
                        fieldCode: pField.code,
                        bitrixId: pField.bitrixId,
                        value: {
                            id: 0,
                            bitrixId: 0,
                            name: '',
                            code: '',
                            value: currentCommentStringValue as string
                        } as OrkHistoryFieldItemValueDto
                    } as OrkHistoryFieldValueDto;





                } else if (
                    pField.code === EnumOrkFieldCode.event_communication ||
                    pField.code === EnumOrkFieldCode.ork_event_action ||
                    pField.code === EnumOrkFieldCode.ork_event_type ||
                    pField.code === EnumOrkFieldCode.ork_event_initiative
                ) {
                    if (typeof currentValue === 'string') {
                        continue;
                    }
                    for (const key in currentValue as Record<string, string | number>) {
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



            }
            return new OrkListHistoryItemDto(resultItem);
        })

    }
}
