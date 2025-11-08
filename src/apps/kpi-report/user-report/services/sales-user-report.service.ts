import { BitrixService } from "@/modules/bitrix";
import { PBXService } from "@/modules/pbx";
import { SalesUserReportGetRequestDto } from "../dto/sales-user-report.dto";
import { Injectable } from "@nestjs/common";
import { IPBXList } from "@/modules/portal/interfaces/portal.interface";
import { PortalModel } from "@/modules/portal/services/portal.model";
// import { EnumOrkFieldCode, OrkFieldsType } from "@/modules/pbx-ork-history-bx-list";
// import { OrkHistoryFieldItemValueDto, OrkHistoryFieldValueDto, OrkListHistoryItemDto } from "@/modules/pbx-ork-history-bx-list/dto/ork-list-history.dto";
import { delay } from "@/lib";
import { BxListItemGetRequestDto } from "@/modules/bitrix/domain/list-item";
import { EnumSalesKpiFieldCode, } from "@/modules/pbx-sales-kpi-list/type/pbx-sales-kpi-list.enum";
import { BitrixFieldType } from "@/apps/konstructor/document-generate/dto/pbx-items.dto";
import { PbxSalesKpiCompanyDto, PbxSalesKpiContactDto, PbxSalesKpiFieldItemValueDto, PbxSalesKpiFieldValueDto, PbxSalesKpiListItemDto } from "@/modules/pbx-sales-kpi-list/dto/pbx-sales-kpi-list.dto";
import { IBXCompany } from "@/modules/bitrix";

@Injectable()
export class SalesUserReportService {
    constructor(
        private readonly pbx: PBXService,


    ) {
    }

    public async *getReport(dto: SalesUserReportGetRequestDto) {
        const { domain, socketId, userId } = dto;
        if (!dto.filters) {
            throw new Error('Filters are required');
        }
        const { dateFrom, dateTo, actions } = dto.filters;
        const { bitrix, portal, PortalModel } = await this.pbx.init(domain);
        const portalKPIList = PortalModel.getListByCode('sales_kpi');
        if (!portalKPIList) throw new Error('Portal KPI list not found');



        const filterForBitrix = this.getFilter(PortalModel, portalKPIList, {
            [EnumSalesKpiFieldCode.responsible]: userId.toString(),
            [EnumSalesKpiFieldCode.event_date]: dateFrom,
            [EnumSalesKpiFieldCode.plan_date]: dateTo,

            // ork_event_date: dateFrom.toISOString(),
            // ork_plan_date: dateTo.toISOString(),
        } as Record<EnumSalesKpiFieldCode, any>);



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
            const preparedResult = await this.prepareResponse(portalList, batch, bitrix);
            const preparedWithCompanies = await this.getCompanies(preparedResult, bitrix);
            // const preparedWithContacts = await this.getContacts(preparedWithCompanies, bitrix);
            yield preparedWithCompanies;
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
    protected getFilter(PortalModel: PortalModel, portalList: IPBXList, filter: Record<EnumSalesKpiFieldCode, any>): Record<string, any> {
        let result: Record<string, any> = {};
        for (const key in filter) {
            const code = key === EnumSalesKpiFieldCode.plan_date ? EnumSalesKpiFieldCode.event_date : key;


            const pField = portalList.bitrixfields?.find(field => field.code === code);

            if (!pField) {
                continue;
            }
            const bitrixId = pField.bitrixCamelId;
            if (!bitrixId) {
                continue;
            }
            const itemCodeOrValue = filter[key as keyof BitrixFieldType]

            if (!itemCodeOrValue) {
                continue;
            }
            if (pField.type === BitrixFieldType.ENUMERATION || pField.type === 'select' ||
                key === EnumSalesKpiFieldCode.event_action ||
                key === EnumSalesKpiFieldCode.event_type ||
                key === EnumSalesKpiFieldCode.op_result_status ||
                key === EnumSalesKpiFieldCode.op_noresult_reason ||
                key === EnumSalesKpiFieldCode.op_work_status ||
                key === EnumSalesKpiFieldCode.op_fail_reason


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

            } else if (key === EnumSalesKpiFieldCode.plan_date) {
                result = {
                    ...result,
                    ['<' + bitrixId]: itemCodeOrValue
                };


            } else if (key === EnumSalesKpiFieldCode.event_date) {
                result = {
                    ...result,
                    ['>' + bitrixId]: itemCodeOrValue
                };


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

    protected async prepareResponse(portalList: IPBXList, listItems: Record<string, any>[], bitrix: BitrixService): Promise<PbxSalesKpiListItemDto[]> {

        let companiesIds: number[] = [];
        let contactsIds: number[] = [];

        const result = listItems.map(item => {
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
            } as PbxSalesKpiListItemDto

            for (const keyFieldBitrixId in item) {
                const pField = portalList.bitrixfields?.find(field => field.bitrixCamelId === keyFieldBitrixId);
                if (!pField) {
                    continue;
                }

                const currentValue = item[keyFieldBitrixId] as Record<string, string | number> | string;
                if (!currentValue) {
                    continue;
                }
                const fieldCode = pField.code as EnumSalesKpiFieldCode;
                if (
                    pField.code === EnumSalesKpiFieldCode.manager_comment ||
                    pField.code === EnumSalesKpiFieldCode.plan_date ||
                    pField.code === EnumSalesKpiFieldCode.event_date ||
                    pField.code === EnumSalesKpiFieldCode.crm_company ||
                    pField.code === EnumSalesKpiFieldCode.crm_contact
                ) {

                    let currentCommentStringValue = ''

                    for (const key in currentValue as Record<string, string>) {
                        currentCommentStringValue += currentValue[key]
                        if (pField.code === EnumSalesKpiFieldCode.crm_company) {

                            currentCommentStringValue = currentCommentStringValue
                                .toString()
                                .replace(/\D/g, '') as string;
                            companiesIds.push(Number(currentCommentStringValue) as number);

                        }
                        if (pField.code === EnumSalesKpiFieldCode.crm_contact) {
                            contactsIds.push(Number(currentCommentStringValue) as number);
                        }

                        if (pField.code === EnumSalesKpiFieldCode.crm_company ||
                            pField.code === EnumSalesKpiFieldCode.crm_contact) {

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
                        } as PbxSalesKpiFieldItemValueDto
                    } as PbxSalesKpiFieldValueDto;





                } else if (

                    pField.code === EnumSalesKpiFieldCode.event_action ||
                    pField.code === EnumSalesKpiFieldCode.event_type
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
                                } as PbxSalesKpiFieldItemValueDto
                            } as PbxSalesKpiFieldValueDto;



                        }
                    }
                }



            }
            return new PbxSalesKpiListItemDto(resultItem);
        })


        return result;
    }


    //TODO: Implement getCompanies and getContacts
    // add company name and contacts (name, post, id...) in list item elements

    protected async getCompanies(listItems: PbxSalesKpiListItemDto[], bitrix: BitrixService) {
        // const result: PbxSalesKpiListItemDto[] = [];
        for (const item of listItems) {
            if (item[EnumSalesKpiFieldCode.crm_company]) {
                const companyId = (item[EnumSalesKpiFieldCode.crm_company].value as PbxSalesKpiFieldItemValueDto).value as string;
                bitrix.batch.company.get('cmd_company_get_' + companyId, Number(companyId));

                // result.push({
                //     ...item,
                //     company: new PbxSalesKpiCompanyDto(company.result)
                // } as PbxSalesKpiListItemDto);
            }
        }
        const companiesBatchResult = await bitrix.api.callBatchWithConcurrency(1);
        const result: PbxSalesKpiListItemDto[] = listItems.map(item => {
            let company: PbxSalesKpiCompanyDto | null = null;

            companiesBatchResult.forEach(response => {
                response.result

                for (const key in response.result) {
                    console.log('key');
                    console.log(key);

                    console.log('item.companyId');
                    console.log((item[EnumSalesKpiFieldCode.crm_company]?.value as PbxSalesKpiFieldItemValueDto).value );
                    const itemCompanyId = (item[EnumSalesKpiFieldCode.crm_company]?.value as PbxSalesKpiFieldItemValueDto).value as string;
                    if (key === 'cmd_company_get_' + itemCompanyId) {
                        console.log('found');
                        console.log(response.result[key]);
                        const searchedCompany = new PbxSalesKpiCompanyDto(response.result[key] as IBXCompany);
                        if (searchedCompany.ID === item.companyId) {
                            company = searchedCompany;
                        }
                    }
                }
            });

            return {
                ...item,
                company: company ?? undefined
            } as PbxSalesKpiListItemDto;
        });
        return result;
    }

    protected async getContacts(listItems: PbxSalesKpiListItemDto[], bitrix: BitrixService) {
        const result: PbxSalesKpiListItemDto[] = [];
        for (const item of listItems) {
            if (item[EnumSalesKpiFieldCode.crm_contact]) {
                const contactId = item[EnumSalesKpiFieldCode.crm_contact].value as string;
                const contact = await bitrix.contact.get(Number(contactId));
                result.push({
                    ...item,
                    contacts: [new PbxSalesKpiContactDto(contact.result)]
                } as PbxSalesKpiListItemDto);
            }
        }
        return result;
    }
}
