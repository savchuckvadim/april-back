import { ApiPropertyOptional } from '@nestjs/swagger';
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
    OFFER_LETTER_NAME_MAX_LENGTH,
    OFFER_LETTER_TEXT_MAX_LENGTH,
} from '@lib/portal-lib/konstructor';
import { OFFER_LETTER_MAX_SORT } from './create-offer-letter.dto';

/**
 * Правка письма: меняются только переданные поля. Портал и менеджер не
 * меняются, письмо по умолчанию назначается отдельной ручкой.
 */
export class UpdateOfferLetterDto {
    @ApiPropertyOptional({
        description: 'Название письма.',
        type: String,
        maxLength: OFFER_LETTER_NAME_MAX_LENGTH,
        example: 'Письмо для новых клиентов',
    })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(OFFER_LETTER_NAME_MAX_LENGTH)
    name?: string;

    @ApiPropertyOptional({
        description:
            'Текст письма с разметкой `<color>`, `<bold>`, `<red>`. Другие теги и незакрытые теги отклоняются.',
        type: String,
        maxLength: OFFER_LETTER_TEXT_MAX_LENGTH,
        example: 'Направляем <bold>коммерческое предложение</bold>.',
    })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(OFFER_LETTER_TEXT_MAX_LENGTH)
    text?: string;

    @ApiPropertyOptional({
        description:
            'Активно ли письмо. Если выключить письмо по умолчанию, его место займёт следующее активное письмо области.',
        type: Boolean,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @ApiPropertyOptional({
        description: 'Порядок в списке: меньше — выше.',
        type: Number,
        minimum: 0,
        maximum: OFFER_LETTER_MAX_SORT,
        example: 10,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(OFFER_LETTER_MAX_SORT)
    sort?: number;
}
