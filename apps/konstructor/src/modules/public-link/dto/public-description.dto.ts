import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsOptional,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';

/**
 * Запрос описания по публичной ссылке. Без домена и пользователя: файл уходит
 * потоком тому, кто спросил, и нигде не хранится. Ручка открыта по токену,
 * поэтому размеры ограничены.
 */
const MAX_NAME_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 50_000;
const MAX_BLOCKS_IN_GROUP = 300;
const MAX_GROUPS = 20;

export class PublicDescriptionBlockDto {
    @ApiProperty({
        description: 'Код блока (инфоблок или сервис каталога)',
        type: String,
    })
    @IsString()
    @MaxLength(MAX_NAME_LENGTH)
    code: string;

    @ApiProperty({ description: 'Название блока в документе', type: String })
    @IsString()
    @MaxLength(MAX_NAME_LENGTH)
    name: string;

    @ApiProperty({
        description:
            'Текст описания с фронта — используется, только если в БД его нет (регионы, подсервисы СТАР)',
        type: String,
        nullable: true,
        required: false,
    })
    @IsOptional()
    @IsString()
    @MaxLength(MAX_DESCRIPTION_LENGTH)
    description?: string | null;
}

export class PublicDescriptionGroupDto {
    @ApiProperty({ description: 'Название группы (как в КП)', type: String })
    @IsString()
    @MaxLength(MAX_NAME_LENGTH)
    name: string;

    @ApiProperty({
        description: 'Блоки группы',
        type: [PublicDescriptionBlockDto],
    })
    @IsArray()
    @ArrayMaxSize(MAX_BLOCKS_IN_GROUP)
    @ValidateNested({ each: true })
    @Type(() => PublicDescriptionBlockDto)
    infoblocks: PublicDescriptionBlockDto[];
}

export class PublicDescriptionRequestDto {
    @ApiProperty({ description: 'Полное название комплекта', type: String })
    @IsString()
    @MaxLength(MAX_NAME_LENGTH)
    complectName: string;

    @ApiProperty({
        description: 'Вид поставки для шапки («3 ОД», «Флэш»)',
        type: String,
    })
    @IsString()
    @MaxLength(MAX_NAME_LENGTH)
    supply: string;

    @ApiProperty({
        description: 'Группы наполнения с блоками',
        type: [PublicDescriptionGroupDto],
    })
    @IsArray()
    @ArrayMaxSize(MAX_GROUPS)
    @ValidateNested({ each: true })
    @Type(() => PublicDescriptionGroupDto)
    groups: PublicDescriptionGroupDto[];
}
