import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsNotEmpty,
    IsString,
    Matches,
    ValidateNested,
} from 'class-validator';
import { CategoryDto } from './parse-category.dto';

/**
 * Тело запроса установки воронок сделки массивом категорий
 * (POST-вариант, в отличие от GET-эндпоинта `install-by-parse`,
 * который читает категории из Excel-шаблона).
 *
 * Каждая категория содержит вложенный список стадий (`stages: StageDto[]`),
 * полная схема — в [parse-category.dto.ts](./parse-category.dto.ts).
 */
export class InstallDealCategoryDto {
    @ApiProperty({
        description:
            'Домен Bitrix-портала, на котором выполняется установка воронок сделки. ' +
            'Передаётся без протокола и завершающего слэша.',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    @Matches(/^[a-z0-9.-]+\.[a-z]{2,}$/i, {
        message:
            'domain must be a valid hostname without protocol (e.g. example.bitrix24.ru)',
    })
    domain!: string;

    @ApiProperty({
        description:
            'Массив воронок сделки с вложенными стадиями. ' +
            'Соответствует формату `ParseCategoryService.getParsedData(...).categories`.',
        type: [CategoryDto],
    })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => CategoryDto)
    categories!: CategoryDto[];
}
