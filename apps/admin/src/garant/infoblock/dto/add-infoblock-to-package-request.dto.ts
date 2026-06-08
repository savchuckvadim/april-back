import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray } from 'class-validator';

export class AddInfoblockPackagesDto {
    @ApiProperty({
        description: 'добавить infoblockpackages в инфоблок.',
        type: [String],
        example: ['1', '2', '3'],
    })
    @IsArray()
    @IsString({ each: true })
    packageIds: string[];
}

export class RemoveInfoblockPackagesDto {
    @ApiProperty({
        description: 'удалить infoblockpackages из инфоблока.',
        type: [String],
        example: ['1', '2', '3'],
    })
    @IsArray()
    @IsString({ each: true })
    packageIds: string[];
}

// DTOs для управления пакетами, в которые входит инфоблок (packages)
export class AddInfoblockToPackagesDto {
    @ApiProperty({
        description:
            'Действие проиходит из одного пакета  с несколькими инфоблоками ',
        type: [String],
        example: ['1', '2', '3'],
    })
    @IsArray()
    @IsString({ each: true })
    infoblockIds: string[];
}

export class RemoveInfoblockFromPackagesDto {
    @ApiProperty({
        description: 'Список ID инфоблоков, которые нужно удалить из пакета',
        type: [String],
        example: ['1', '2', '3'],
    })
    @IsArray()
    @IsString({ each: true })
    infoblockIds: string[];
}

export class SetInfoblockInPackagesDto {
    @ApiProperty({
        description:
            'Список ID инфоблоков, которые входят в пакет (заменит все существующие)',
        type: [String],
        example: ['1', '2', '3'],
    })
    @IsArray()
    @IsString({ each: true })
    infoblockIds: string[];
}
