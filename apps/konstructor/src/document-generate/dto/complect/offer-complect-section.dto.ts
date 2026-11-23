import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ComplectDto } from './complect.dto';

/**
 * Комплект общего набора со своим наполнением. КП печатает такие разделы,
 * когда менеджер выбрал вид «по комплектам» (`complectsMode: separate`):
 * у каждого комплекта свой заголовок и свои группы инфоблоков.
 */
export class OfferComplectSectionDto {
    @ApiProperty({
        description:
            'Название комплекта — заголовок его раздела наполнения, например «ГАРАНТ-Профессионал. Бухгалтерия»',
        type: String,
        example: 'ГАРАНТ-Профессионал. Бухгалтерия',
    })
    @IsString()
    title: string;

    @ApiPropertyOptional({
        description:
            'Подпись поставки комплекта — печатается под заголовком раздела, например «Интернет 3 ОД». Без неё печатается только название комплекта',
        type: String,
        example: 'Интернет 3 ОД',
    })
    @IsOptional()
    @IsString()
    supplyName?: string;

    @ApiProperty({
        description: 'Наполнение комплекта: группы инфоблоков',
        type: [ComplectDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ComplectDto)
    complect: ComplectDto[];
}
