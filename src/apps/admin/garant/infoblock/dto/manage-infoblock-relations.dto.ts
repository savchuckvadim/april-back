import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class SetInfoblockGroupDto {
    @ApiProperty({
        description: 'Group ID',
        example: '1',
        required: false,
        type: String,
    })
    @IsString()
    @IsOptional()
    group_id?: string | null;
}

// export class SetInfoblockParentDto {
//     @ApiProperty({
//         description: 'Parent ID',
//         example: '1',
//         required: true,
//         type: String,
//     })
//     @IsString()
//     parent_id?: string | null;
// }

// export class SetInfoblockRelationDto {
//     @ApiProperty({
//         description: 'Relation ID',
//         example: '1',
//         required: false,
//         type: String,
//     })
//     @IsString()
//     @IsOptional()
//     relation_id?: string | null;
// }

// export class SetInfoblockRelatedDto {
//     @ApiProperty({
//         description: 'Related ID',
//         example: '1',
//         required: false,
//         type: String,
//     })
//     @IsString()
//     @IsOptional()
//     related_id?: string | null;
// }

export class SetInfoblockExcludedDto {
    @ApiProperty({
        description: 'Excluded ID',
        example: '1',
        required: false,
        type: String,
    })
    @IsString()
    @IsOptional()
    excluded_id?: string | null;
}
