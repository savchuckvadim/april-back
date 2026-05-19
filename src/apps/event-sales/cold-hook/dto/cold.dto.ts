import { IsBxHookUserId } from '@/core/decorators/dto/bx-hook-user-id.decorator';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';

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
export class ColdCallQueryDto  {
    @ApiProperty({ example: 'company', enum: EnumColdCallEntityType })
    @IsEnum(EnumColdCallEntityType)
    entityType: EnumColdCallEntityType;

    @ApiProperty({ example: 'some entity id' })
    @IsString()
    entityId: string;

    @ApiProperty({ example: 'user_123' })
    @IsBxHookUserId()
    responsible: string;

    @ApiProperty({ example: 'user_123' })
    @IsBxHookUserId()
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
