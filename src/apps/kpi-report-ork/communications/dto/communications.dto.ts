import {  Type } from 'class-transformer';
import {
    IsArray,
    IsEnum,
    IsString,
    ValidateNested,
    IsNumber,

} from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';
import { EnumCommunicationCode } from '../type/ork-report-communications.type';
import { BitrixUser, FieldItem } from '@/apps/kpi-report/dto/kpi.dto';

export class FilterCommunication {
    @ApiProperty()
    @IsNumber()
    order: number;

    @ApiProperty({ type: FieldItem })
    @ValidateNested()
    @Type(() => FieldItem)
    actionItem: FieldItem;

    @ApiProperty({ type: FieldItem })
    @ValidateNested()
    @Type(() => FieldItem)
    communicationItem: FieldItem;

    @ApiProperty({ type: FieldItem })
    @ValidateNested()
    @Type(() => FieldItem)
    initiativeItem: FieldItem;

    @ApiProperty({ enum: EnumCommunicationCode })
    @IsEnum(EnumCommunicationCode)
    innerCode: EnumCommunicationCode;

    @ApiProperty()
    @IsString()
    name?: string;

    @ApiProperty({ enum: EnumCommunicationCode })
    @IsEnum(EnumCommunicationCode)
    code: EnumCommunicationCode;
}


export class KPICommunication {
    @ApiProperty()
    @IsString()
    id: string;

    @ApiProperty({ type: FilterCommunication })
    @ValidateNested()
    @Type(() => FilterCommunication)
    action: FilterCommunication;

    @ApiProperty()
    @IsNumber()
    count: number;

    // @IsArray()
    // @ValidateNested({ each: true })
    // @Type(() => KPIListItem)
    // list?: Array<KPIListItem>;
}


export class CommunicationsReportData {
    @ApiProperty()
    @ValidateNested()
    @Type(() => BitrixUser)
    user: BitrixUser;

    @ApiProperty()
    @IsString()
    userName?: string;

    @ApiProperty({ type: [KPICommunication], description: 'KPI Communication data' })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => KPICommunication)
    kpi: KPICommunication[];
}


export class GetReportCommunicationsResponseDto {
    @ApiProperty({ type: [CommunicationsReportData] , description: 'Report data'})
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CommunicationsReportData)
    report: CommunicationsReportData[];
}
