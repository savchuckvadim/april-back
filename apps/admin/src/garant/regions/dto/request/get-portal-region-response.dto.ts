import { ApiProperty } from '@nestjs/swagger';
import { GetRegionResponseDto } from './get-region-response.dto';
import { IsBoolean } from 'class-validator';
import {
    PortalRegionLink,
    RegionEntity,
    resolvePortalPrice,
} from '@lib/garant';

/**
 * Регион глазами портала. abs/tax/tax_abs — общий рабс справочника,
 * own_* — свои настройки связи, effective_* — цена, по которой портал
 * реально считает (источник → ручной → общий).
 */
export class GetPortalRegionResponseDto extends GetRegionResponseDto {
    constructor(region: RegionEntity, link: PortalRegionLink | null) {
        super(region);
        this.isChecked = link !== null;
        this.own_abs = link?.ownAbs && link.ownAbs > 0 ? link.ownAbs : null;
        this.own_abs_region_id = link?.ownAbsRegion
            ? Number(link.ownAbsRegion.id)
            : null;
        this.own_abs_region_code = link?.ownAbsRegion?.code ?? null;
        this.own_abs_region_title = link?.ownAbsRegion?.title ?? null;
        const effective = resolvePortalPrice(region, link);
        this.effective_abs = effective.abs;
        this.effective_tax = effective.tax;
        this.effective_tax_abs = effective.tax_abs;
    }

    @ApiProperty({
        description: 'Регион привязан к порталу (есть связь portal_region).',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    isChecked: boolean;

    @ApiProperty({
        description:
            'Ручной рабс портала для региона; null — не задан. ' +
            'Задаётся вместо регион-источника, одновременно они не бывают.',
        example: 5000,
        type: Number,
        nullable: true,
    })
    own_abs: number | null;

    @ApiProperty({
        description:
            'ID региона-источника, чей рабс портал берёт за свой; null — не задан. ' +
            'Обновление цен источника подхватывается автоматически.',
        example: 47,
        type: Number,
        nullable: true,
    })
    own_abs_region_id: number | null;

    @ApiProperty({
        description: 'Код региона-источника; null — не задан.',
        example: 'spb',
        type: String,
        nullable: true,
    })
    own_abs_region_code: string | null;

    @ApiProperty({
        description: 'Название региона-источника; null — не задан.',
        example: 'Ленинградская область',
        type: String,
        nullable: true,
    })
    own_abs_region_title: string | null;

    @ApiProperty({
        description:
            'Действующий рабс портала по этому региону: источник → ручной → общий.',
        example: 4177.2,
        type: Number,
    })
    effective_abs: number;

    @ApiProperty({
        description: 'Действующий налоговый множитель портала по региону.',
        example: 1.2,
        type: Number,
    })
    effective_tax: number;

    @ApiProperty({
        description: 'Действующий рабс с налогом портала по региону.',
        example: 5012.64,
        type: Number,
    })
    effective_tax_abs: number;
}
