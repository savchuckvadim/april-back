import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsString, ValidateNested } from 'class-validator';

export enum EnumColdCallEntityType {
    COMPANY = 'company',
    CONTACT = 'contact',
    DEAL = 'deal',
    LEAD = 'lead',
}
export enum EnumColdCallIsTmc {
    Y = 'Y',
    N = 'N',

}
export class ColdCallQueryDto {

    @ApiProperty({ example: 'company', enum: EnumColdCallEntityType })
    @IsEnum(EnumColdCallEntityType)
    entityType: EnumColdCallEntityType;

    @ApiProperty({ example: 'some entity id' })
    @IsString()
    entityId: string;

    @ApiProperty({ example: 'user_123' })
    @IsString()
    responsible: string;

    @ApiProperty({ example: 'user_123' })
    @IsString()
    created: string;

    @ApiProperty({ example: '2021-01-01' })
    @IsString()
    deadline: string;


    @ApiProperty({ example: 'some name' })
    @IsString()
    name: string;

    @ApiProperty({ example: EnumColdCallIsTmc.Y, enum: EnumColdCallIsTmc })
    @IsEnum(EnumColdCallIsTmc)
    isTmc: EnumColdCallIsTmc;
}

export class ColdCallBodyDto {
    @ValidateNested()
    @Type(() => ColdCallAuthDto)
    auth: ColdCallAuthDto;
}

export class ColdCallAuthDto {
    @IsString()
    domain: string;
}
