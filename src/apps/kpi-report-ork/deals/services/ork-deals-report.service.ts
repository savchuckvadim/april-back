import { PBXService } from "@/modules/pbx";
import { BadRequestException, Injectable } from "@nestjs/common";
import { PbxDealCategoryCodeEnum, PortalDealServiceStageCodeEnum } from "@/modules/portal/services/types/deals/portal.deal.type";
import { OrkReportCompanyItemDto, OrkReportDealItemDto, OrkReportDealsByCompaniesDto, OrkReportDealsResponseDto } from "../dto/ork-report-deals.dto";
import { IBXCompany, IBXDeal } from "@/modules/bitrix";
import { PortalModel } from "@/modules/portal/services/portal.model";
import { IBXFile, IBXFileItemField } from "@/modules/bitrix/domain/file/bx-file.interface";
import { IField } from "@/modules/portal/interfaces/portal.interface";


@Injectable()
export class OrkDealsReportService {
    constructor(private readonly pbx: PBXService) { }

    async getReport(domain: string): Promise<OrkReportDealsResponseDto> {
        const result: OrkReportDealsByCompaniesDto[] = []
        const { bitrix, PortalModel: portal } = await this.pbx.init(domain);
        const pbxDealCategory = portal.getDealCategoryByCode(PbxDealCategoryCodeEnum.service_base);
        if (!pbxDealCategory) {
            throw new BadRequestException('Pbx deal not found');
        }
        const categoryId = pbxDealCategory.bitrixId
        const noincludeStage = portal.getDealStageByCode(
            PbxDealCategoryCodeEnum.service_base,
            PortalDealServiceStageCodeEnum.double
        );
        const dealsGetSelect = this.getDealsSelect(portal);
        const companiesGetSelect = this.getCompaniesSelect(portal);



        const deals = await bitrix.deal.all({
            CATEGORY_ID: categoryId,
            "!=STAGE_ID": noincludeStage?.bitrixId
        }, dealsGetSelect)
        const dealsByCompanyId = {}
        const companiesIds: Number[] = []
        for (const deal of deals) {
            if (Number(deal.ID) === 88565) {
                console.log('deal');
                console.log(deal);
                console.log('--------------------------------');
            }
            const companyId = Number(deal.COMPANY_ID)
            if (!dealsByCompanyId[companyId]) {
                dealsByCompanyId[companyId] = {
                    deals: [deal] as IBXDeal[],
                    company: null as IBXCompany | null,
                };
            } else {
                dealsByCompanyId[companyId].deals.push(deal);

            }
            companiesIds.push(companyId)
            // if (!dealsByCompanyId[deal.COMPANY_ID]) {
            //     dealsByCompanyId[deal.COMPANY_ID] = [];
            // }

        }
        console.log('companiesIds');
        console.log(companiesIds);
        console.log('--------------------------------');
        const companies = await bitrix.company.all({
            '@ID': companiesIds
        }, companiesGetSelect)
        companies.map(company => {
            const companyId = Number(company.ID)

            // if (!dealsByCompanyId[companyId]) {
            //     dealsByCompanyId[companyId] = [];
            // }

            const typedDeals: OrkReportDealItemDto[] = dealsByCompanyId[companyId].deals.map((deal: IBXDeal) => this.prepareDeal(deal, portal));
            const isActiveClient = typedDeals.some(tDeal => tDeal.isInProgress)
            dealsByCompanyId[companyId].company = this.prepareCompany(company, isActiveClient);
            const dealByCompanyReportItem = new OrkReportDealsByCompaniesDto(typedDeals, dealsByCompanyId[companyId].company);
            result.push(dealByCompanyReportItem);
            if (companyId === 97719) {
                console.log('company');
                console.log(company);
                console.log('dealByCompanyReportItem');
                console.log(dealByCompanyReportItem);
                console.log('--------------------------------');
            }
        })
        return new OrkReportDealsResponseDto(result);
    }

    private prepareCompany(company: IBXCompany, isActiveClient: boolean): OrkReportCompanyItemDto {

        const result = {
            id: Number(company.ID),
            title: company.TITLE as string,
            assignedById: company.ASSIGNED_BY_ID as string,
            history: company.UF_CRM_ORK_LAST_HISTORY as string[],
            armInfo: company.UF_CRM_USER_CARDNUM as string || '',
            isActiveClient
        } as OrkReportCompanyItemDto;
        return result;
    }

    private prepareDeal(deal: IBXDeal, portal: PortalModel): OrkReportDealItemDto {
        const stageName = this.getDealStageName(deal.STAGE_ID as string, portal);
        const status = this.getDealStatus(deal);
        const { from, to } = this.getFromTo(deal, portal);
        const duration = this.getDuration(deal, portal);
        const monthSum = this.getMonthSum(deal.OPPORTUNITY as string, duration);
        const result = {
            id: Number(deal.ID),
            title: deal.TITLE as string,
            currentContract: deal.UF_CRM_CURRENT_CONTRACT as unknown as IBXFileItemField,
            stageId: deal.STAGE_ID as string,
            categoryId: deal.CATEGORY_ID as string,
            assignedById: deal.ASSIGNED_BY_ID as string,
            companyId: deal.COMPANY_ID as string,
            sum: deal.OPPORTUNITY as string,
            from: from as string,
            to: to as string,
            duration,


            monthSum: monthSum as number,



            createDate: deal.DATE_CREATE as string,
            closedDate: deal.CLOSED_DATE as string,
            isClosed: deal.CLOSED === 'Y',
            isWon: deal.STAGE_ID.includes('WON'),
            isLost: deal.STAGE_ID.includes('LOST'),
            isInProgress: !deal.STAGE_ID.includes('WON') && !deal.STAGE_ID.includes('LOST'),

            lastActivityDate: deal.LAST_ACTIVITY_DATE as string,
            status: status,
            armInfo: deal.UF_CRM_RPA_ARM_COMPLECT_ID || [] as string[],
            complectName: deal.UF_CRM_RPA_ARM_COMPLECT_NAME?.toString() || '' as string,
            supply: deal.UF_CRM_RPA_ARM_SUPPLY_NAME?.toString() || '' as string,
            stageName: stageName as string,

        } as OrkReportDealItemDto;

        return result;
    }

    private getFromTo(deal: IBXDeal, portal: PortalModel): { from: string, to: string } {
        const contractEndDate = this.getDealFieldCodeByBitrixId(portal, 'contract_end');
        const contractStartDate = this.getDealFieldCodeByBitrixId(portal, 'contract_start');
        const contractEndDateBitrixId = portal.getDealFieldBitrixIdByCode('contract_end')
        const contractStartDatBitrixId = portal.getDealFieldBitrixIdByCode('contract_start')
        const contractStart = deal[`${contractStartDatBitrixId}`]
        const contractEnd = deal[`${contractEndDateBitrixId}`]
        const rawFrom = contractStart || deal.DATE_CREATE || '' as string;
        const rawTo = contractEnd || deal.CLOSED_DATE || '' as string;
        // if (Number(deal.ID) === 91403 || Number(deal.ID) === 122625) {
        //     console.log("contractStart")
        //     console.log(contractStart)
        //     console.log("deal.DATE_CREATE")
        //     console.log(deal.DATE_CREATE)

        //     console.log("contractEnd")
        //     console.log(contractEnd)
        //     console.log("deal.CLOSED_DATE")
        //     console.log(deal.CLOSED_DATE)
        //     console.log("rawFrom")
        //     console.log(rawFrom)
        //     console.log("rawTo")
        //     console.log(rawTo)
        //     console.log("--------------------------------")
        //     console.log("--------------------------------")
        //     console.log("--------------------------------")
        //     console.log("--------------------------------")
        //     console.log(deal)
        // }

        return {
            from: rawFrom as string,
            to: rawTo as string,
        }
    }
    private getMonthSum(sum: string, duration: number): number {
        const sumNumber = Number(sum);
        const durationNumber = Number(duration);
        return Number((sumNumber / durationNumber).toFixed(2)) as number;
    }
    private getDuration(deal: IBXDeal, portal: PortalModel): number {
        const { from: rawFrom, to: rawTo } = this.getFromTo(deal, portal);

        const from = new Date(String(rawFrom)).getTime();
        const to = new Date(String(rawTo)).getTime();
        return Number(((to - from) / (1000 * 60 * 60 * 24) / 30).toFixed(0)) || 1; // месяцы


    }

    private getDealStageName(stageId: string | undefined, portal: PortalModel): string {

        let stageName = 'В Работе';
        if (!stageId) {
            return stageName;
        }
        const pDeal = portal.getDealCategoryByCode(PbxDealCategoryCodeEnum.service_base)

        pDeal?.stages.forEach((stage, index) => {
            if (stage.bitrixId === stageId) {
                stageName = stage.name;
            }
        })
        return stageName;
    }
    private getDealStatus(deal: IBXDeal): string {
        if (deal.CLOSED !== 'Y') {
            return 'in_progress';
        }
        if (deal.STAGE_ID.includes('WON')) {
            return 'success';
        }
        return 'failed';
    }

    private getDealsSelect(portal: PortalModel): string[] {
        const dealsGetSelect: string[] = [
            'ID',
            'TITLE',
            'STAGE_ID',
            'CATEGORY_ID',
            'ASSIGNED_BY_ID',
            'COMPANY_ID',
            "OPPORTUNITY",
            "UF_CRM_RPA_ARM_COMPLECT_ID",
            "UF_CRM_CARDNUM",
            "DATE_CREATE",
            "CLOSED_DATE",
            "CLOSED",
            "CONTACT_ID",
            "LAST_COMMUNICATION_TIME",
            "LAST_ACTIVITY_DATE"
        ]
        const pDeal = portal.getDeal()
        pDeal.bitrixfields.forEach((field, index) => {

            if (
                field.code === 'supply' ||
                field.code === 'contract' ||
                field.code === 'complect_name' ||
                field.code === 'contract_start' || field.code === 'contract_end' ||
                field.code === 'contract_type' ||
                field.code === 'current_contract' ||
                field.code === 'ork_current_contract_sum' ||
                field.code === 'ork_last_history' ||

                field.code === 'document_provider'
            ) {
                console.log(field.code);
                dealsGetSelect.push(`UF_CRM_${field.bitrixId}`)
            }

        })
        return dealsGetSelect
    }
    private getDealFieldCodeByBitrixId(portal: PortalModel, bitrixId: string): IField | undefined {

        const pDeal = portal.getDeal()
        const pField = pDeal.bitrixfields.find(field => `UF_CRM_${field.bitrixId}` === bitrixId);
        return pField;
    }

    private getCompaniesSelect(portal: PortalModel): string[] {
        const companiesGetSelect: string[] = [
            'ID',
            'TITLE',
            'ASSIGNED_BY_ID',
            "UF_CRM_USER_CARDNUM",
            "CONTACT_ID",
            "UF_CRM_ORK_LAST_HISTORY"
        ]

        const pCompanyFields = portal.getCompanyFields()
        pCompanyFields.forEach((field, index) => {


            if (

                field.code === 'ork_last_history'
            ) {
                console.log(field.code);
                companiesGetSelect.push(`UF_CRM_${field.bitrixId}`)
            }
        })
        return companiesGetSelect
    }
}
