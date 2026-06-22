import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { TemplateCounterPivotData } from '@lib/portal-lib/konstructor';

/**
 * Pivot-данные связи «шаблон ↔ счётчик» (`template_counter`).
 * Используется при привязке (`POST`) и обновлении (`PATCH`) счётчика шаблона.
 */
export class UpsertTemplateCounterDto implements TemplateCounterPivotData {
    @ApiPropertyOptional({
        description: 'Текущее значение счётчика в рамках шаблона',
        example: '0',
        type: String,
    })
    @IsOptional()
    @IsString()
    value?: string | null;

    @ApiPropertyOptional({
        description: 'Префикс номера (например «INV»)',
        example: 'INV',
        type: String,
    })
    @IsOptional()
    @IsString()
    prefix?: string | null;

    @ApiPropertyOptional({
        description: 'Учитывать день в номере',
        example: false,
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    day?: boolean;

    @ApiPropertyOptional({
        description: 'Учитывать год в номере',
        example: true,
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    year?: boolean;

    @ApiPropertyOptional({
        description: 'Учитывать месяц в номере',
        example: false,
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    month?: boolean;

    @ApiPropertyOptional({
        description: 'Текущий счётчик (число выпущенных номеров)',
        example: 0,
        type: Number,
        minimum: 0,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    count?: number;

    @ApiPropertyOptional({
        description: 'Размер (минимальная длина числовой части номера)',
        example: 1,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    size?: number;
}
