import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber } from 'class-validator';
import { PbxEntityType } from '@/shared/enums';

export class GetChildrenByPbxEntityDto {
    @ApiProperty({
        description: 'Entity type',
        example: PbxEntityType.SMART,
        enum: PbxEntityType,
    })
    @IsEnum(PbxEntityType)
    entityType: PbxEntityType;

    @ApiProperty({
        description: 'Entity ID',
        example: 1,
        type: Number,
    })
    @IsNumber()
    entityId: number;
}
