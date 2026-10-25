import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsInt,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';

/** Блок наполнения для описания: код для поиска текста в БД, имя — как в документе. */
export class ComplectDescriptionInfoblockDto {
    @ApiProperty({
        description: 'Код блока (инфоблок или сервис каталога)',
        type: String,
    })
    @IsString()
    code: string;

    @ApiProperty({ description: 'Название блока в документе', type: String })
    @IsString()
    name: string;

    @ApiProperty({
        description:
            'Текст описания с фронта — используется, только если в БД его нет (сервисы LT/СТАР)',
        type: String,
        nullable: true,
        required: false,
    })
    @IsOptional()
    @IsString()
    description?: string | null;
}

export class ComplectDescriptionGroupDto {
    @ApiProperty({ description: 'Название группы (как в КП)', type: String })
    @IsString()
    name: string;

    @ApiProperty({
        description: 'Блоки группы',
        type: [ComplectDescriptionInfoblockDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ComplectDescriptionInfoblockDto)
    infoblocks: ComplectDescriptionInfoblockDto[];
}

/** Запрос «Описание комплекта» — замена Laravel getDescription (решение владельца 9). */
export class ComplectDescriptionGenerateDto {
    @ApiProperty({ description: 'Домен портала', type: String })
    @IsString()
    domain: string;

    @ApiProperty({
        description: 'ID пользователя Bitrix — папка файла',
        type: Number,
    })
    @IsInt()
    userId: number;

    @ApiProperty({ description: 'Полное название комплекта', type: String })
    @IsString()
    complectName: string;

    @ApiProperty({
        description: 'Вид поставки для шапки («3 ОД», «Флэш»)',
        type: String,
    })
    @IsString()
    supply: string;

    @ApiProperty({
        description: 'Группы наполнения с блоками',
        type: [ComplectDescriptionGroupDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ComplectDescriptionGroupDto)
    groups: ComplectDescriptionGroupDto[];
}

export class ComplectDescriptionResponseDto {
    @ApiProperty({
        description: 'Публичная ссылка на DOCX (/api/files/<token>)',
        type: String,
    })
    link: string;

    @ApiProperty({ description: 'Имя файла', type: String })
    documentName: string;

    @ApiProperty({
        description: 'Сколько блоков попало в описание (с текстом)',
        type: Number,
    })
    infoblocksCount: number;
}
