/**
 * DTO ручки `GET admin/ai-analytics/cost` (план Фазы 3, П5): расход
 * языковой модели по порталу за месяц. Отдельный файл от обратной связи
 * — по лимиту 300 строк.
 */
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';
import type {
    CostByType,
    CostSummary,
} from '../services/ai-analytics-cost.service';
import { AI_ANALYTICS_KEY_PATTERNS } from './ai-analytics-pipeline-admin.dto';

/** Запрос расхода модели за месяц. */
export class AiAnalyticsCostQueryDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24.',
        example: 'april.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty({ message: 'domain обязателен' })
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim().toLowerCase() : value,
    )
    domain: string;

    @ApiProperty({
        description:
            'Календарный месяц YYYY-MM. Границы берутся по UTC от ' +
            'created_at записей ais.',
        example: '2026-09',
        type: String,
    })
    @IsString()
    @Matches(AI_ANALYTICS_KEY_PATTERNS.month, {
        message: 'month: ожидается YYYY-MM',
    })
    month: string;
}
/** Расход по одному типу снапшота. */
export class AiAnalyticsCostTypeDto implements CostByType {
    @ApiProperty({
        description: 'Тип снапшота, чьи записи несли вызов модели.',
        example: 'ai-analytics-brief',
        type: String,
    })
    type: string;

    @ApiProperty({
        description: 'Записей с вызовом модели (tokens_count > 0).',
        example: 41,
        type: Number,
    })
    calls: number;

    @ApiProperty({
        description: 'Суммарно токенов по колонке tokens_count.',
        example: 128400,
        type: Number,
    })
    tokens: number;

    @ApiProperty({
        description: 'Суммарная стоимость по колонке price, ₽.',
        example: 256.8,
        type: Number,
    })
    price: number;

    @ApiProperty({
        description:
            'Оценка стоимости по цене реестра: токены / 1000 × ' +
            'llm_price_per_1k, ₽. null — цена в реестре не задана (0).',
        example: 256.8,
        type: Number,
        nullable: true,
    })
    estimatedPrice: number | null;
}

/** Ответ ручки расхода модели. */
export class AiAnalyticsCostResultDto implements CostSummary {
    @ApiProperty({
        description: 'Домен портала.',
        example: 'april.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Календарный месяц YYYY-MM.',
        example: '2026-09',
        type: String,
    })
    month: string;

    @ApiProperty({
        description:
            'Цена 1 000 токенов из реестра параметров (llm_price_per_1k), ' +
            '₽. Ноль означает «цена не задана».',
        example: 2,
        type: Number,
    })
    pricePerThousand: number;

    @ApiProperty({
        description:
            'Числа ответа — оценка, а не факт биллинга: цена реестра ' +
            'нулевая либо записи не несут стоимости в колонке price.',
        example: false,
        type: Boolean,
    })
    estimated: boolean;

    @ApiProperty({
        description: 'Всего вызовов модели за месяц.',
        example: 41,
        type: Number,
    })
    calls: number;

    @ApiProperty({
        description: 'Всего токенов за месяц.',
        example: 128400,
        type: Number,
    })
    tokens: number;

    @ApiProperty({
        description: 'Всего по колонкам price, ₽.',
        example: 256.8,
        type: Number,
    })
    price: number;

    @ApiProperty({
        description: 'Всего по цене реестра, ₽; null — цена не задана.',
        example: 256.8,
        type: Number,
        nullable: true,
    })
    estimatedPrice: number | null;

    @ApiProperty({
        description: 'Разрез по типам снапшотов; типы без вызовов опущены.',
        type: [AiAnalyticsCostTypeDto],
    })
    byType: AiAnalyticsCostTypeDto[];
}
