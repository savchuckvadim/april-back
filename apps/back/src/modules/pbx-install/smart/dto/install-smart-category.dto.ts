import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsEnum,
    IsNotEmpty,
    IsString,
    Matches,
    ValidateNested,
} from 'class-validator';
import { CategoryDto } from '@/modules/pbx-install/deal/dto/parse-category.dto';
import { SmartGroupEnum, SmartNameEnum } from './install-smart.dto';

/**
 * Тело запроса установки воронок смарта массивом категорий (POST-вариант).
 *
 * В отличие от GET-эндпоинта `install-by-parse`, не читает Excel — принимает
 * категории напрямую в теле запроса. Схема `CategoryDto[]` — та же, что для сделки.
 */
export class InstallSmartCategoryDto {
    @ApiProperty({
        description:
            'Домен Bitrix-портала, на котором выполняется установка воронок смарта. ' +
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
            'Имя смарта (то же значение, что в URL установки и в `smarts.type`).',
        example: SmartNameEnum.PRESENTATION,
        enum: SmartNameEnum,
    })
    @IsEnum(SmartNameEnum)
    smartName!: SmartNameEnum;

    @ApiProperty({
        description:
            'Группа отдела, к которой относится смарт (`smarts.group`).',
        example: SmartGroupEnum.SALES,
        enum: SmartGroupEnum,
    })
    @IsEnum(SmartGroupEnum)
    group!: SmartGroupEnum;

    @ApiProperty({
        description:
            'Массив воронок смарта с вложенными стадиями. ' +
            'Соответствует формату `ParseSmartService.getParsedData(...)[0].categories`.',
        type: [CategoryDto],
    })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => CategoryDto)
    categories!: CategoryDto[];
}
