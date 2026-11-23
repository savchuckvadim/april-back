import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsInt,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';
import { OfferComplectSectionDto } from './offer-complect-section.dto';

/**
 * Наполнение одного набора для сравнения. КП печатает такие разделы, когда
 * менеджер включил показ наполнения наборов для сравнения: после наполнения
 * общего набора идёт блок «Наполнение наборов для сравнения», в нём у каждого
 * набора свой заголовок и наполнение его комплектов.
 */
export class OfferAlternativeSetComplectsDto {
    @ApiProperty({
        description:
            'Номер набора для сравнения — тот же, что у набора в таблице цен (`setId` его строк): наборы нумеруются с 1',
        type: Number,
        minimum: 1,
        example: 1,
    })
    @IsInt()
    @Min(1)
    setNumber: number;

    @ApiProperty({
        description:
            'Заголовок набора — тот же, что в таблице цен, например «Набор 1»',
        type: String,
        example: 'Набор 1',
    })
    @IsString()
    title: string;

    @ApiProperty({
        description:
            'Комплекты набора со своим наполнением: название, подпись поставки и группы инфоблоков каждого комплекта',
        type: [OfferComplectSectionDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => OfferComplectSectionDto)
    complects: OfferComplectSectionDto[];
}
