import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { measures } from 'generated/prisma';

/** Глобальная единица измерения (`measures`) — справочник для добавления на портал. */
export class MeasureResponseDto {
    constructor(measure: measures) {
        this.id = Number(measure.id);
        this.name = measure.name;
        this.shortName = measure.shortName;
        this.fullName = measure.fullName;
        this.code = measure.code;
        this.type = measure.type;
    }

    @ApiProperty({
        description: 'ID единицы измерения',
        example: 1,
        type: Number,
    })
    id: number;

    @ApiProperty({
        description: 'Наименование',
        example: 'Штука',
        type: String,
    })
    name: string;

    @ApiProperty({
        description: 'Краткое наименование',
        example: 'шт',
        type: String,
    })
    shortName: string;

    @ApiProperty({
        description: 'Полное наименование',
        example: 'Штука',
        type: String,
    })
    fullName: string;

    @ApiProperty({ description: 'Код', example: '796', type: String })
    code: string;

    @ApiPropertyOptional({ description: 'Тип', example: 'base', type: String })
    type?: string | null;
}
