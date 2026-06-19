import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { portal_measure } from 'generated/prisma';

/** Портальная единица измерения (`portal_measure`). */
export class PortalMeasureResponseDto {
    constructor(portalMeasure: portal_measure) {
        this.id = Number(portalMeasure.id);
        this.measure_id = Number(portalMeasure.measure_id);
        this.portal_id = Number(portalMeasure.portal_id);
        this.bitrixId = portalMeasure.bitrixId;
        this.name = portalMeasure.name;
        this.shortName = portalMeasure.shortName;
        this.fullName = portalMeasure.fullName;
    }

    @ApiProperty({
        description: 'ID портальной единицы измерения',
        example: 1,
        type: Number,
    })
    id: number;

    @ApiProperty({
        description: 'ID глобальной единицы измерения (measures)',
        example: 1,
        type: Number,
    })
    measure_id: number;

    @ApiProperty({ description: 'ID портала', example: 1, type: Number })
    portal_id: number;

    @ApiPropertyOptional({
        description: 'ID единицы измерения в Bitrix',
        example: '5',
        type: String,
    })
    bitrixId?: string | null;

    @ApiPropertyOptional({
        description: 'Наименование',
        example: 'Штука',
        type: String,
    })
    name?: string | null;

    @ApiPropertyOptional({
        description: 'Краткое наименование',
        example: 'шт',
        type: String,
    })
    shortName?: string | null;

    @ApiPropertyOptional({
        description: 'Полное наименование',
        example: 'Штука',
        type: String,
    })
    fullName?: string | null;
}
