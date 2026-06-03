import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class AddInfoblocksDto {
    @ApiProperty({
        description: 'Список ID инфоблоков для добавления',
        type: [String],
        example: ['1', '2', '3'],
    })
    @IsArray()
    @IsString({ each: true })
    infoblockIds: string[];
}

export class RemoveInfoblocksDto {
    @ApiProperty({
        description: 'Список ID инфоблоков для удаления',
        type: [String],
        example: ['1', '2', '3'],
    })
    @IsArray()
    @IsString({ each: true })
    infoblockIds: string[];
}

export class SetInfoblocksDto {
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
