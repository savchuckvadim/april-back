import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import {
    OFFER_LETTER_MARKUP_TAGS,
    OFFER_LETTER_NAME_MAX_LENGTH,
    OFFER_LETTER_TEXT_MAX_LENGTH,
} from '@lib/portal-lib/konstructor';

/** Самый большой порядковый номер письма: дальше порядок задавать нечем */
export const OFFER_LETTER_MAX_SORT = 100000;

const TEXT_DESCRIPTION =
    'Текст письма с разметкой: ' +
    OFFER_LETTER_MARKUP_TAGS.map(tag => `<${tag}>…</${tag}>`).join(', ') +
    '. `<color>` — акцентный цвет, `<red>` — красный (оба жирным), ' +
    '`<bold>` — жирный. Абзацы — перевод строки.';

export class CreateOfferLetterDto {
    @ApiProperty({
        description: 'Портал, которому принадлежит письмо.',
        type: Number,
        example: 12,
    })
    @IsInt()
    @Min(1)
    portalId: number;

    @ApiPropertyOptional({
        description:
            'Менеджер (Bitrix-id), чьё это личное письмо. Не указан или null — письмо портала.',
        type: Number,
        nullable: true,
        example: 1480,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    bxUserId?: number | null;

    @ApiProperty({
        description: 'Название письма: по нему письмо выбирают в списке.',
        type: String,
        maxLength: OFFER_LETTER_NAME_MAX_LENGTH,
        example: 'Письмо для новых клиентов',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(OFFER_LETTER_NAME_MAX_LENGTH)
    name: string;

    @ApiProperty({
        description: TEXT_DESCRIPTION,
        type: String,
        maxLength: OFFER_LETTER_TEXT_MAX_LENGTH,
        example:
            'Благодарим за интерес к системе <color>ГАРАНТ</color>.\nНаправляем <bold>коммерческое предложение</bold>.',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(OFFER_LETTER_TEXT_MAX_LENGTH)
    text: string;

    @ApiPropertyOptional({
        description:
            'Сделать письмо письмом по умолчанию своей области (портала или менеджера). ' +
            'Первое активное письмо области становится письмом по умолчанию само.',
        type: Boolean,
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    isDefault?: boolean;

    @ApiPropertyOptional({
        description:
            'Активно ли письмо. Неактивное нельзя сделать письмом по умолчанию.',
        type: Boolean,
        default: true,
    })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @ApiPropertyOptional({
        description: 'Порядок в списке: меньше — выше.',
        type: Number,
        minimum: 0,
        maximum: OFFER_LETTER_MAX_SORT,
        default: 0,
        example: 10,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(OFFER_LETTER_MAX_SORT)
    sort?: number;
}
