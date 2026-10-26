import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayNotEmpty,
    IsArray,
    IsBoolean,
    IsInt,
    IsOptional,
    ValidateNested,
} from 'class-validator';
import {
    IsDecimal,
    TransformToDecimalString,
} from '@/core/decorators/dto/decimal.decorator';

export class BulkPortalRegionItemDto {
    @ApiProperty({
        description: 'ID региона из справочника regions.',
        example: 12,
        type: Number,
    })
    @IsInt()
    regionId: number;

    @ApiProperty({
        description:
            'Чекбокс региона на портале: true — регион включён (связь создаётся), false — выключен (связь удаляется).',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    enabled: boolean;

    @ApiPropertyOptional({
        description:
            'Собственный рабс портала для региона (часто берётся из рабса другого региона). ' +
            'Не передан — own-значения не меняются; null — сбрасываются к общему рабсу региона. ' +
            'own_tax (1.20) и own_tax_abs считаются на бэке.',
        example: '4177.20',
        oneOf: [{ type: 'string' }, { type: 'number' }],
        nullable: true,
    })
    @IsOptional()
    @TransformToDecimalString()
    @IsDecimal()
    ownAbs?: string | null;
}

export class BulkSetPortalRegionsDto {
    @ApiProperty({
        description: 'ID портала, чьи регионы настраиваются.',
        example: 3,
        type: Number,
    })
    @IsInt()
    portalId: number;

    @ApiProperty({
        description:
            'Изменённые чекбоксы регионов (достаточно передавать только изменившиеся строки).',
        type: [BulkPortalRegionItemDto],
    })
    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => BulkPortalRegionItemDto)
    items: BulkPortalRegionItemDto[];
}

export class BulkPortalRegionSkippedDto {
    @ApiProperty({
        description: 'ID региона, который не удалось обработать.',
        example: 12,
        type: Number,
    })
    regionId: number;

    @ApiProperty({
        description: 'Причина пропуска.',
        example: 'не удалось включить регион',
        type: String,
    })
    reason: string;
}

export class BulkSetPortalRegionsResultDto {
    @ApiProperty({
        description: 'Сколько регионов включено на портале.',
        example: 5,
        type: Number,
    })
    enabled: number;

    @ApiProperty({
        description: 'Сколько регионов выключено.',
        example: 2,
        type: Number,
    })
    disabled: number;

    @ApiProperty({
        description: 'Скольким регионам обновлён собственный рабс.',
        example: 3,
        type: Number,
    })
    updatedOwn: number;

    @ApiProperty({
        description: 'Пропущенные строки с причинами.',
        type: [BulkPortalRegionSkippedDto],
    })
    skipped: BulkPortalRegionSkippedDto[];
}
