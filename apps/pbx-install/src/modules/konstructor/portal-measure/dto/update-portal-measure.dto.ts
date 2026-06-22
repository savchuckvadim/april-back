import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Тело запроса на частичное обновление портальной единицы измерения
 * (`portal_measure`). Связи (`measure_id`, `portal_id`) не редактируются —
 * меняются только человекочитаемые поля и `bitrixId`.
 */
export class UpdatePortalMeasureDto {
    @ApiPropertyOptional({
        description: 'ID единицы измерения в Bitrix',
        example: '5',
        type: String,
    })
    @IsOptional()
    @IsString()
    bitrixId?: string;

    @ApiPropertyOptional({
        description: 'Наименование',
        example: 'Штука',
        type: String,
    })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({
        description: 'Краткое наименование',
        example: 'шт',
        type: String,
    })
    @IsOptional()
    @IsString()
    shortName?: string;

    @ApiPropertyOptional({
        description: 'Полное наименование',
        example: 'Штука',
        type: String,
    })
    @IsOptional()
    @IsString()
    fullName?: string;
}
