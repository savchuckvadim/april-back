import { IsBoolean } from "class-validator";
import { IsNumber } from "class-validator";
import { IsOptional } from "class-validator";
import { IsString } from "class-validator";
import { IsArray } from "class-validator";
import { ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";

class ComplectValueDto {
    @ApiProperty({ description: 'Name of the complect value' })
    @IsString() name: string;
    @ApiProperty({ description: 'Title of the complect value' })
    @IsOptional() @IsString() title?: string;
    @ApiProperty({ description: 'Number of the complect value' })
    @IsOptional() @IsNumber() number?: number;
    @ApiProperty({ description: 'Code of the complect value' })
    @IsOptional() @IsString() code?: string;
    @ApiProperty({ description: 'Checked of the complect value' })
    @IsBoolean() checked: boolean;
    @ApiProperty({ description: 'Weight of the complect value' })
    @IsNumber() weight: number;
    @ApiProperty({ description: 'Description of the complect value' })
    @IsString() description: string;
    @ApiProperty({ description: 'Is LA of the complect value' })
    @IsOptional() @IsBoolean() isLa?: boolean;
}

export class ComplectDto {
    @ApiProperty({ description: 'Name of the complect' })
    @IsString() groupsName: string;
    @ApiProperty({ description: 'Value of the complect', type: [ComplectValueDto] })
    @IsArray() @ValidateNested({ each: true }) @Type(() => ComplectValueDto) value: ComplectValueDto[];
}
