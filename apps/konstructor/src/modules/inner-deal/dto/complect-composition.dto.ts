import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsEnum,
    IsInt,
    IsOptional,
    ValidateNested,
} from 'class-validator';
import {
    ComplectModeEnum,
    ComplectOfferInfoblocksEnum,
} from '../type/complect-composition.type';

export class ComplectOfferSettingsDto {
    @ApiProperty({
        description:
            'Инфоблоки в КП: independent — у каждого набора своя страница, повторы допустимы; merged — единый порядок, повторяющиеся схлопываются',
        enum: ComplectOfferInfoblocksEnum,
        enumName: 'ComplectOfferInfoblocks',
        default: ComplectOfferInfoblocksEnum.INDEPENDENT,
    })
    @IsEnum(ComplectOfferInfoblocksEnum)
    infoblocks: ComplectOfferInfoblocksEnum;

    @ApiProperty({
        description:
            'Показывать в КП наборы «для сравнения» рядом с основными (альтернативные наборы)',
        type: Boolean,
        default: false,
    })
    @IsBoolean()
    showAlternatives: boolean;
}

/**
 * Кто из вариантов участвует, здесь НЕ хранится: участие — это стадия элемента
 * смарта («Текущий», «Отклонён»). Второй список тех же id неизбежно разъехался
 * бы со стадиями, которые менеджер двигает прямо в Битриксе.
 */
export class ComplectCompositionDto {
    @ApiProperty({
        description:
            'Что делаем с несколькими наборами: compare — альтернативы на выбор; multi_contract — вместе, каждый своим договором; single_contract — вместе одним договором (только при одинаковом типе договора)',
        enum: ComplectModeEnum,
        enumName: 'ComplectMode',
        default: ComplectModeEnum.COMPARE,
    })
    @IsEnum(ComplectModeEnum)
    mode: ComplectModeEnum;

    @ApiProperty({
        description: 'Настройки КП. У договора и счёта настроек нет',
        type: ComplectOfferSettingsDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ComplectOfferSettingsDto)
    offer: ComplectOfferSettingsDto;

    @ApiProperty({
        description:
            'Вариант, открытый в конструкторе сейчас. Не участие (участие — стадия элемента), а «что редактируется»: без него конструктор после перезагрузки терял, в каком варианте шла работа',
        type: Number,
        nullable: true,
        required: false,
    })
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    openVariantSmartId: number | null;
}
