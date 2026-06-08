import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class AddInfogroupInfoblocksDto {
    @ApiProperty({
        description: 'Список ID инфоблоков для добавления',
        type: [String],
        example: ['1', '2', '3'],
    })
    @IsArray()
    @IsString({ each: true })
    infoblockIds: string[];
}

export class RemoveInfogroupInfoblocksDto {
    @ApiProperty({
        description: 'Список ID инфоблоков для удаления',
        type: [String],
        example: ['1', '2', '3'],
    })
    @IsArray()
    @IsString({ each: true })
    infoblockIds: string[];
}

export class SetInfogroupInfoblocksDto {
    @ApiProperty({
        description:
            'Список ID инфоблоков для установки (заменит все существующие)',
        type: [String],
        example: ['1', '2', '3'],
    })
    @IsArray()
    @IsString({ each: true })
    infoblockIds: string[];
}
