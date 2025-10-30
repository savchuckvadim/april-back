import { IBXCompany } from "@/modules/bitrix";
import { IBXDeal } from "@/modules/bitrix/domain/crm/deal/interface/bx-deal.interface";
import { IBXFile, IBXFileItemField } from "@/modules/bitrix/domain/file/bx-file.interface";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, ValidateNested } from "class-validator";

export class OrkReportDealItemDto {
    // constructor(deal: IBXDeal) {
    //     Object.assign(this, deal);
    // }
    // [key: string]: string | number | string[] | number[] | boolean | undefined;

    // @ApiProperty({ description: 'Deal ID' })
    // ID: number;
    // @ApiProperty({ description: 'Deal Title' })
    // TITLE: string;
    // @ApiProperty({ description: 'Deal Stage ID' })
    // STAGE_ID: string;
    // @ApiProperty({ description: 'Deal Category ID' })
    // CATEGORY_ID: string;
    // @ApiProperty({ description: 'Deal Assigned By ID' })
    // ASSIGNED_BY_ID: string;
    // @ApiProperty({ description: 'Deal Company ID' })
    // COMPANY_ID: string;
    @ApiProperty({ description: 'Deal id' })
    id: number;
    @ApiProperty({ description: 'Deal title' })
    title: string;
    @ApiProperty({ description: 'Deal stage id' })
    stageId: string;
    @ApiProperty({ description: 'Deal category id' })
    categoryId: string;
    @ApiProperty({ description: 'Deal stage name' })
    stageName: string;

    @ApiProperty({ description: 'Deal assigned by id' })
    assignedById: string;
    @ApiProperty({ description: 'Deal company id' })
    companyId: string;
    @ApiProperty({ description: 'Deal sum' })
    sum: string;
    @ApiProperty({ description: 'Deal from' })
    from: string;
    @ApiProperty({ description: 'Deal to' })
    to: string;

    @ApiProperty({ description: 'Deal month sum' })
    monthSum: number;
    @ApiProperty({ description: 'Deal duration' })
    duration: number;




    @ApiProperty({ description: 'Deal create date' })
    createDate: string;
    @ApiProperty({ description: 'Deal closed date' })
    closedDate: string;
    @ApiProperty({ description: 'Deal is closed' })
    isClosed: boolean;
    @ApiProperty({ description: 'Deal is won' })
    isWon: boolean;
    @ApiProperty({ description: 'Deal is lost' })
    isLost: boolean;
    @ApiProperty({ description: 'Deal is in progress' })
    isInProgress: boolean;
    @ApiProperty({ description: 'Deal last activity date' })
    lastActivityDate: string;
    @ApiProperty({ description: 'Deal status' })
    status: 'in_progress' | 'success' | 'failed';
    @ApiProperty({ description: 'Deal arm info' })
    armInfo: string[];
    @ApiProperty({ description: 'Deal complect name' })
    complectName: string;
    @ApiProperty({ description: 'Deal supply' })
    supply: string;
    @ApiProperty({ description: 'Deal current contract' })
    currentContract: IBXFileItemField | undefined = undefined;


}
export class OrkReportCompanyItemDto {

    @ApiProperty({ description: 'Company id' })
    id: number;
    @ApiProperty({ description: 'Company title' })
    title: string;


    @ApiProperty({ description: 'Company assigned by id' })
    assignedById: string;
    @ApiProperty({ description: 'Company history' })
    history: string[];
    @ApiProperty({ description: 'Company arm info' })
    armInfo: string;

    @ApiProperty({ description: 'Is active client' })
    isActiveClient: boolean

}
// export class OrkReportCompanyResponseDto implements Partial<IBXCompany> {
//     constructor(company: IBXCompany) {
//         Object.assign(this, company);
//     }
//     [key: string]: string | number | string[] | number[] | boolean | undefined;

//     @ApiProperty({ description: 'Company ID' })
//     ID: number;
//     @ApiProperty({ description: 'Company Title' })
//     TITLE: string;
//     // @ApiProperty({ description: 'Company Comments' })
//     // COMMENTS: string;
//     // @ApiProperty({ description: 'Company UF_CRM_PRES_COUNT' })
//     // UF_CRM_PRES_COUNT: number;
//     @ApiProperty({ description: 'Company UF_CRM_USER_CARDNUM' })
//     UF_CRM_USER_CARDNUM: string;
// }




export class OrkReportDealsByCompaniesDto {
    constructor(deals: OrkReportDealItemDto[], company: OrkReportCompanyItemDto) {
        this.deals = deals;
        this.company = company;
    }
    @ApiProperty({ description: 'Deals', type: [OrkReportDealItemDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => OrkReportDealItemDto)
    deals: OrkReportDealItemDto[];

    @ApiProperty({ description: 'Company', type: OrkReportCompanyItemDto })
    @ValidateNested()
    @Type(() => OrkReportCompanyItemDto)
    company: OrkReportCompanyItemDto;


}


export class OrkReportDealsResponseDto {
    constructor(companies: OrkReportDealsByCompaniesDto[]) {

        this.companies = companies;
    }


    @ApiProperty({ description: 'Companies', type: [OrkReportDealsByCompaniesDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => OrkReportDealsByCompaniesDto)
    companies: OrkReportDealsByCompaniesDto[];
}
