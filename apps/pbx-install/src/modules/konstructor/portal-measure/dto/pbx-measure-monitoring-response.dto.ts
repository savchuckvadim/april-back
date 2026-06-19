import { ApiProperty } from '@nestjs/swagger';
import { BxMeasure } from '../types/bx-measure.type';
import { PortalMeasureResponseDto } from './portal-measure-response.dto';
import { MeasureResponseDto } from './measure-response.dto';

/** Единица измерения из Bitrix клиента (нормализованная). */
export class BxMeasureDto implements BxMeasure {
    @ApiProperty({
        description: 'ID единицы измерения в Bitrix',
        example: 5,
        type: Number,
    })
    id: number;

    @ApiProperty({ description: 'Код ОКЕИ', example: '796', type: String })
    code: string;

    @ApiProperty({ description: 'Название', example: 'Штука', type: String })
    title: string;

    @ApiProperty({
        description: 'Условное обозначение',
        example: 'шт',
        type: String,
    })
    symbol: string;

    @ApiProperty({ description: 'По умолчанию', example: true, type: Boolean })
    isDefault: boolean;
}

/**
 * «pbx»-единица измерения = `portalDB` + `bitrix` (что реально в Bitrix клиента),
 * сопоставленные по ключу. Любая из сторон может отсутствовать.
 */
export class PbxMeasureDto {
    @ApiProperty({
        description: 'Ключ сопоставления (bitrixId единицы измерения)',
        example: '5',
        type: String,
    })
    key: string;

    @ApiProperty({
        description: 'Сторона PortalDB (portal_measure) или null',
        type: PortalMeasureResponseDto,
        nullable: true,
    })
    portal: PortalMeasureResponseDto | null;

    @ApiProperty({
        description: 'Сторона Bitrix (реальная единица измерения) или null',
        type: BxMeasureDto,
        nullable: true,
    })
    bitrix: BxMeasureDto | null;
}

/**
 * Сводка единиц измерения портала: смерженные (portalDB ↔ Bitrix) + хвосты с обеих
 * сторон + глобальный справочник `measures` (что можно добавить на портал).
 */
export class PbxMeasureMonitoringResponseDto {
    @ApiProperty({
        description:
            'Смерженные единицы измерения (есть и в portalDB, и/или в Bitrix)',
        type: [PbxMeasureDto],
    })
    mergedMeasures: PbxMeasureDto[];

    @ApiProperty({
        description: 'Единицы измерения portalDB без пары в Bitrix',
        type: [PortalMeasureResponseDto],
    })
    portalMeasuresWithoutMerged: PortalMeasureResponseDto[];

    @ApiProperty({
        description: 'Единицы измерения Bitrix без пары в portalDB',
        type: [BxMeasureDto],
    })
    bitrixMeasuresWithoutMerged: BxMeasureDto[];

    @ApiProperty({
        description: 'Глобальный справочник единиц измерения (measures)',
        type: [MeasureResponseDto],
    })
    globalMeasures: MeasureResponseDto[];
}
