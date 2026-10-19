import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Расход языковой модели на разбор (три фокус-вызова + синтез либо один
 * цельный вызов): сумма токенов всех удавшихся вызовов и модель из ответа
 * провайдера. Приём разбора кладёт сумму в колонку ais.tokens_count, а
 * стоимость по цене портала (llm_price_per_1k) — в ais.price; так
 * `GET admin/ai-analytics/cost` видит разборы наравне с резюме.
 */
export class AgentAnalysisUsageDto {
    @ApiProperty({
        description:
            'Токенов всего по вызовам, вернувшим учёт: prompt + completion ' +
            'каждого вызова (без обоих — total_tokens провайдера).',
        example: 18420,
        type: Number,
        minimum: 0,
    })
    @IsInt()
    @Min(0)
    tokens: number;

    @ApiProperty({
        description:
            'Токенов промпта суммарно; null — ни один вызов не вернул разбивку.',
        example: 16100,
        type: Number,
        nullable: true,
        minimum: 0,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    promptTokens: number | null;

    @ApiProperty({
        description:
            'Токенов ответа суммарно; null — ни один вызов не вернул разбивку.',
        example: 2320,
        type: Number,
        nullable: true,
        minimum: 0,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    completionTokens: number | null;

    @ApiProperty({
        description: 'Удавшихся вызовов модели в разборе.',
        example: 4,
        type: Number,
        minimum: 0,
    })
    @IsInt()
    @Min(0)
    calls: number;

    @ApiProperty({
        description:
            'Сколько из вызовов вернули учёт токенов; меньше calls — сумма ' +
            'tokens занижена (провайдер не отдал usage).',
        example: 4,
        type: Number,
        minimum: 0,
    })
    @IsInt()
    @Min(0)
    callsWithUsage: number;

    @ApiProperty({
        description:
            'Модель из ответа провайдера (первая, которую он назвал); ' +
            'null — не вернул.',
        example: 'bitrix/bitrixgpt-5.5',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    model: string | null;
}
