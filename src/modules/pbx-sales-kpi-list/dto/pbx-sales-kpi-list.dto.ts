import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString, ValidateNested } from "class-validator";
import { EnumSalesKpiFieldCode } from "../type/pbx-sales-kpi-list.enum";
import { IBXCompany, IBXContact } from "@/modules/bitrix";
import { Type } from "class-transformer";

export class PbxSalesKpiListDto {
    responsible: string;
    dateFrom: string;
    dateTo: string;
}

export class PbxSalesKpiFieldItemValueDto {
    @ApiProperty({ description: 'ID' })
    id: number
    @ApiProperty({ description: 'Bitrix ID' })
    bitrixId: number
    @ApiProperty({ description: 'Name' })
    name: string

    @ApiProperty({ description: 'Value' })
    @IsOptional()
    @IsString()
    value?: string


    @ApiProperty({ description: 'Code' })
    code: string
}

export class PbxSalesKpiFieldValueDto {
    @ApiProperty({ description: 'Field Name' })
    fieldName: string
    @ApiProperty({ description: 'Field Code' })
    fieldCode: string
    @ApiProperty({ description: 'Bitrix ID' })
    bitrixId: string
    @ApiProperty({ description: 'Value', type: PbxSalesKpiFieldItemValueDto })
    value: PbxSalesKpiFieldItemValueDto | string
}

export class PbxSalesKpiContactDto {
    constructor(data: IBXContact) {
        Object.assign(this, data);
    }

    @ApiProperty({ description: 'Name' })
    NAME: string
    @ApiProperty({ description: 'Last Name' })
    LAST_NAME: string
    @ApiProperty({ description: 'Second Name' })
    SECOND_NAME: string
    @ApiProperty({ description: 'Post' })
    POST: string

}

export class PbxSalesKpiCompanyDto implements IBXCompany {
    constructor(data: IBXCompany) {
        Object.assign(this, data);
    }
    @ApiProperty({ description: 'Assigned By ID' })
    ASSIGNED_BY_ID: string
    @ApiProperty({ description: 'ID' })
    ID: number
    @ApiProperty({ description: 'Title' })
    TITLE: string
    @ApiProperty({ description: 'UF_CRM_PRES_COUNT' })
    UF_CRM_PRES_COUNT: number
    @ApiProperty({ description: 'UF_CRM_USER_CARDNUM' })
    UF_CRM_USER_CARDNUM: string
    @ApiProperty({ description: 'Comments' })
    COMMENTS: string



}

export class PbxSalesKpiListItemDto {
    constructor(data: PbxSalesKpiListItemDto) {
        Object.assign(this, data);
    }





    @ApiProperty({ description: 'ID' })
    id: number
    @ApiProperty({ description: 'Title' })
    title: string
    @ApiProperty({ description: 'Date' })
    date: string


    @ApiProperty({ description: 'Responsible' })
    [EnumSalesKpiFieldCode.responsible]?: PbxSalesKpiFieldValueDto;


    @ApiProperty({ description: 'Action', type: PbxSalesKpiFieldValueDto })
    [EnumSalesKpiFieldCode.event_action]?: PbxSalesKpiFieldValueDto;
    @ApiProperty({ description: 'Type', type: PbxSalesKpiFieldValueDto })
    [EnumSalesKpiFieldCode.event_type]?: PbxSalesKpiFieldValueDto;
    @ApiProperty({ description: 'CRM', type: PbxSalesKpiFieldValueDto })
    [EnumSalesKpiFieldCode.crm]?: PbxSalesKpiFieldValueDto;


    @ApiProperty({ description: 'Contact ID' })
    [EnumSalesKpiFieldCode.crm_contact]?: PbxSalesKpiFieldValueDto;


    @ApiProperty({ description: 'Comment', type: PbxSalesKpiFieldValueDto })
    [EnumSalesKpiFieldCode.manager_comment]?: PbxSalesKpiFieldValueDto;


    @ApiProperty({ description: 'Event Date', type: PbxSalesKpiFieldValueDto })
    [EnumSalesKpiFieldCode.event_date]?: PbxSalesKpiFieldValueDto;

    @ApiProperty({ description: 'Plan Date', type: PbxSalesKpiFieldValueDto })
    [EnumSalesKpiFieldCode.plan_date]?: PbxSalesKpiFieldValueDto;



    @ApiProperty({ description: 'Company', type: PbxSalesKpiFieldValueDto })
    [EnumSalesKpiFieldCode.crm_company]?: PbxSalesKpiFieldValueDto;
    @ApiProperty({ description: 'Company ID' })
    companyId: number


    @ApiProperty({ description: 'Contact ID' })
    contactId: number


    @ApiProperty({ description: 'Company', type: PbxSalesKpiCompanyDto })
    @IsOptional()
    company?: PbxSalesKpiCompanyDto;


    @ApiProperty({ description: 'Contacts', type: PbxSalesKpiContactDto })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PbxSalesKpiContactDto)
    contacts?: PbxSalesKpiContactDto[];



}



