import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { BXUserDto } from '../../shared/dto/bx-user.dto';

// BXUserDto вынесен в shared (общий для report / airtime / calling-statistic).
// Ре-экспорт сохраняет обратную совместимость для импортов внутри report.
export { BXUserDto };

export class ReportGetFiltersDto {
    @ApiProperty()
    @IsString()
    dateFrom: string;

    @ApiProperty()
    @IsString()
    dateTo: string;

    @ApiProperty({ type: [String] })
    @IsArray()
    userIds: Array<string | number>;

    @ApiProperty({ type: [BXUserDto] })
    @ValidateNested({ each: true })
    @Type(() => BXUserDto)
    @IsArray()
    departament: BXUserDto[];

    @ApiProperty()
    @IsString()
    userFieldId: string;

    @ApiProperty()
    @IsString()
    dateFieldId: string;

    @ApiProperty()
    @IsString()
    actionFieldId: string;

    @ApiProperty()
    @IsObject()
    currentActions: any;
}

export class ReportGetRequestDto {
    @ApiProperty()
    @IsString()
    domain: string;

    @ApiProperty({ type: ReportGetFiltersDto })
    @ValidateNested()
    @Type(() => ReportGetFiltersDto)
    filters: ReportGetFiltersDto;
}
