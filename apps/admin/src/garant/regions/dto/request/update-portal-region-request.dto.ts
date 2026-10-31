import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt } from 'class-validator';
import {
    IsDecimal,
    TransformToDecimalString,
} from '@/core/decorators/dto/decimal.decorator';

/**
 * Форма своей цены одного региона портала. Ручной рабс и регион-источник
 * взаимоисключающие; оба пустые — возврат к общему рабсу региона.
 */
export class UpdatePortalRegionDtoAdmin {
    @ApiProperty({
        description: 'Домен портала Bitrix24.',
        example: 'april-dev.bitrix24.ru',
        required: true,
    })
    @IsString()
    domain: string;

    @ApiProperty({
        description: 'Код региона из справочника.',
        example: 'kbr',
        required: true,
    })
    @IsString()
    regionCode: string;

    @ApiProperty({
        description:
            'Ручной рабс портала (decimal 8,2; строка или число). ' +
            'Пусто или null — ручного рабса нет. own_tax и own_tax_abs считаются на бэке.',
        example: '1000.00',
        required: false,
        oneOf: [{ type: 'string' }, { type: 'number' }],
    })
    @IsOptional()
    @TransformToDecimalString()
    @IsDecimal()
    own_abs?: string | null;

    @ApiProperty({
        description:
            'Налоговый множитель ручного рабса. Отдаётся формой для показа, на запись не влияет.',
        example: '1.20',
        required: false,
        oneOf: [{ type: 'string' }, { type: 'number' }],
    })
    @IsOptional()
    @TransformToDecimalString()
    @IsDecimal()
    own_tax?: string | null;

    @ApiProperty({
        description:
            'Ручной рабс с налогом. Отдаётся формой для показа, на запись не влияет.',
        example: '1200.00',
        required: false,
        oneOf: [{ type: 'string' }, { type: 'number' }],
    })
    @IsOptional()
    @TransformToDecimalString()
    @IsDecimal()
    own_tax_abs?: string | null;

    @ApiPropertyOptional({
        description:
            'ID региона-источника, чей рабс портал берёт за свой. ' +
            'Задаётся вместо ручного рабса; null — ссылки нет.',
        example: 47,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    own_abs_region_id?: number | null;
}
