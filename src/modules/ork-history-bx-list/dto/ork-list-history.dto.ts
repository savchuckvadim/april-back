import { ApiProperty } from "@nestjs/swagger";
import { EnumOrkFieldCode } from "../type/ork-list-history.enum";
import { IsOptional, IsString } from "class-validator";

export class OrkListHistoryDto {
    responsible: string;
    dateFrom: string;
    dateTo: string;
}

export class OrkHistoryFieldItemValueDto {
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

export class OrkHistoryFieldValueDto {
    @ApiProperty({ description: 'Field Name' })
    fieldName: string
    @ApiProperty({ description: 'Field Code' })
    fieldCode: string
    @ApiProperty({ description: 'Bitrix ID' })
    bitrixId: string
    @ApiProperty({ description: 'Value', type: OrkHistoryFieldItemValueDto  })
    value: OrkHistoryFieldItemValueDto | string
}


export class OrkListHistoryItemDto {
    constructor(data: OrkListHistoryItemDto) {
        Object.assign(this, data);
    }





    @ApiProperty({ description: 'ID' })
    id: number
    @ApiProperty({ description: 'Title' })
    title: string
    @ApiProperty({ description: 'Date' })
    date: string

    
    @ApiProperty({ description: 'Responsible' })
    [EnumOrkFieldCode.responsible]?: OrkHistoryFieldValueDto;


    @ApiProperty({ description: 'Action', type: OrkHistoryFieldValueDto })
    [EnumOrkFieldCode.ork_event_action]?: OrkHistoryFieldValueDto;
    @ApiProperty({ description: 'Type', type: OrkHistoryFieldValueDto })
    [EnumOrkFieldCode.ork_event_type]?: OrkHistoryFieldValueDto;
    @ApiProperty({ description: 'CRM', type: OrkHistoryFieldValueDto })
    [EnumOrkFieldCode.crm]?: OrkHistoryFieldValueDto;


    @ApiProperty({ description: 'Contact ID' })
    [EnumOrkFieldCode.ork_crm_contact]?: OrkHistoryFieldValueDto;


    @ApiProperty({ description: 'Comment', type: OrkHistoryFieldValueDto })
    [EnumOrkFieldCode.manager_comment]?: OrkHistoryFieldValueDto;


    @ApiProperty({ description: 'Event Date', type: OrkHistoryFieldValueDto })
    [EnumOrkFieldCode.ork_event_date]?: OrkHistoryFieldValueDto;

    @ApiProperty({ description: 'Plan Date', type: OrkHistoryFieldValueDto })
    [EnumOrkFieldCode.ork_plan_date]?: OrkHistoryFieldValueDto;



    @ApiProperty({ description: 'Company', type: OrkHistoryFieldValueDto })
    [EnumOrkFieldCode.ork_crm_company]?: OrkHistoryFieldValueDto;
    @ApiProperty({ description: 'Company ID' })
    companyId: number

    @ApiProperty({ description: 'Communication', type: OrkHistoryFieldValueDto })
    [EnumOrkFieldCode.event_communication]?: OrkHistoryFieldValueDto;
    @ApiProperty({ description: 'Initiative', type: OrkHistoryFieldValueDto })
    [EnumOrkFieldCode.ork_event_initiative]?: OrkHistoryFieldValueDto;
    @ApiProperty({ description: 'Event Tag', type: OrkHistoryFieldValueDto })
    [EnumOrkFieldCode.ork_evemt_tag]?: OrkHistoryFieldValueDto;
}



