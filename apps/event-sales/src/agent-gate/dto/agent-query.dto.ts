import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Параметры выборки звонков, ожидающих анализа агентом. */
export class AgentCallsQueryDto {
    @ApiPropertyOptional({
        description:
            'Домен портала: с ним возвращаются только звонки этого портала, без — всех.',
        example: 'april-garant.bitrix24.ru',
        type: String,
    })
    @IsOptional()
    @IsString()
    domain?: string;

    @ApiPropertyOptional({
        description: 'Максимум звонков в ответе (по умолчанию 20).',
        example: 20,
        type: Number,
        minimum: 1,
        maximum: 100,
        default: 20,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;
}
