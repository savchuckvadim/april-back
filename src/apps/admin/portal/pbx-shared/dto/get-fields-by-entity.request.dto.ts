import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber } from 'class-validator';
import { PbxEntityType } from '../type/pbx-entity-type.enum';

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
