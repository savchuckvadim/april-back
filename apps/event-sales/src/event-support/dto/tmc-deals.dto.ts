import {
    IsArray,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IBXDeal } from '@/modules/bitrix';
import { IsNumeric } from '@/core/decorators/dto/string-to-number-transform-validate.decorator';

/**
 * ТМЦ-сделки для возврата презентационных задач в отдел ТМЦ.
 * Замена legacy PHP `POST full/pres/tmcdeals`.
 */
export class TmcTaskRefDto {
    @ApiProperty({
        description: 'Идентификатор задачи Bitrix.',
        type: Number,
        example: 1024,
    })
    @IsNumeric()
    id: number;

    @ApiPropertyOptional({
        description:
            'CRM-привязки задачи (`UF_CRM_TASK`), например `["CO_123"]`.',
        type: [String],
        example: ['CO_123'],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    ufCrmTask?: string[];
}

export class TmcDealsRequestDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24.',
        type: String,
        example: 'april-dev.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: 'Задачи, для которых ищутся связанные ТМЦ-сделки.',
        type: [TmcTaskRefDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => TmcTaskRefDto)
    tasks: TmcTaskRefDto[];
}

export class TmcDealForReturnDto {
    @ApiProperty({
        description: 'Идентификатор задачи, к которой относится ТМЦ-сделка.',
        type: Number,
        example: 1024,
    })
    taskId: number;

    @ApiProperty({
        description:
            'ТМЦ-сделка (`IBXDeal`). Структура соответствует сделке Bitrix.',
        type: Object,
    })
    @IsObject()
    tmcDeal: IBXDeal;

    @ApiPropertyOptional({
        description: 'Связанная презентационная сделка (`IBXDeal`), если есть.',
        type: Object,
        nullable: true,
    })
    @IsOptional()
    @IsObject()
    presDeal?: IBXDeal;
}
