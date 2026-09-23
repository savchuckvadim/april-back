/**
 * DTO ручного запуска конвейера из админки (план Фазы 3, П5):
 * `POST admin/ai-analytics/recompute` и `POST admin/ai-analytics/backfill`.
 * Обе ручки только ставят джобы — расчёт идёт в воркере kpi-report-sales.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
} from 'class-validator';
import {
    AI_ANALYTICS_ADMIN_RHYTHMS,
    AiAnalyticsAdminRhythm,
} from '../ai-analytics-admin.const';

/** Регулярки ключей периодов (те же формы, что у конвейера). */
export const AI_ANALYTICS_KEY_PATTERNS = {
    month: /^\d{4}-(0[1-9]|1[0-2])$/,
    week: /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/,
    day: /^\d{4}-\d{2}-\d{2}$/,
} as const;

/** Верхняя граница белого списка шагов в одном запросе. */
export const AI_ANALYTICS_STEPS_MAX = 30;

const trimLower = ({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Домен портала — общее поле всех админ-ручек AI-аналитики. */
export class AiAnalyticsDomainBodyDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24, по которому идёт операция.',
        example: 'april.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty({ message: 'domain обязателен' })
    @Transform(trimLower)
    domain: string;
}

/** Принудительный пересчёт периода одним ритмом конвейера. */
export class AiAnalyticsRecomputeDto extends AiAnalyticsDomainBodyDto {
    @ApiProperty({
        description:
            'Ритм конвейера, которым считать период: nightly — день, ' +
            'weekly — закончившаяся неделя, monthly — закрытый месяц, ' +
            'backfill — догон истории. Аудит данных Фазы 0 сюда не входит: ' +
            'для него есть POST admin/ai-analytics/audit.',
        example: 'monthly',
        type: String,
        enum: AI_ANALYTICS_ADMIN_RHYTHMS,
    })
    @IsString()
    @IsIn(AI_ANALYTICS_ADMIN_RHYTHMS as unknown as string[], {
        message: 'rhythm: допустимы nightly, weekly, monthly, backfill',
    })
    rhythm: AiAnalyticsAdminRhythm;

    @ApiProperty({
        description:
            'Месяц прогона YYYY-MM в часовом поясе портала: часть ключа ' +
            'снапшотов месячного зерна и месяц контекста прогона.',
        example: '2026-08',
        type: String,
    })
    @IsString()
    @Matches(AI_ANALYTICS_KEY_PATTERNS.month, {
        message: 'monthKey: ожидается YYYY-MM',
    })
    monthKey: string;

    @ApiPropertyOptional({
        description:
            'День прогона YYYY-MM-DD в поясе портала. Не задан — раннер ' +
            'считает его сам по ритму и месяцу.',
        example: '2026-08-31',
        type: String,
    })
    @IsOptional()
    @IsString()
    @Matches(AI_ANALYTICS_KEY_PATTERNS.day, {
        message: 'day: ожидается YYYY-MM-DD',
    })
    day?: string;

    @ApiPropertyOptional({
        description:
            'ISO-неделя прогона YYYY-Www (для ритма weekly — та самая ' +
            'закончившаяся неделя). Не задана — считает раннер.',
        example: '2026-W35',
        type: String,
    })
    @IsOptional()
    @IsString()
    @Matches(AI_ANALYTICS_KEY_PATTERNS.week, {
        message: 'weekKey: ожидается YYYY-Www',
    })
    weekKey?: string;

    @ApiPropertyOptional({
        description:
            'Белый список кодов шагов конвейера (calls, kpi, finance, ' +
            'stage-history, portal-model и т. д.). Пусто — все шаги ритма.',
        example: ['calls', 'kpi'],
        type: [String],
        maxItems: AI_ANALYTICS_STEPS_MAX,
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(AI_ANALYTICS_STEPS_MAX)
    @IsString({ each: true, message: 'steps: коды шагов строками' })
    steps?: string[];
}

/** Догон истории диапазоном месяцев: по джобе backfill на месяц. */
export class AiAnalyticsBackfillDto extends AiAnalyticsDomainBodyDto {
    @ApiProperty({
        description: 'Первый месяц диапазона YYYY-MM включительно.',
        example: '2026-01',
        type: String,
    })
    @IsString()
    @Matches(AI_ANALYTICS_KEY_PATTERNS.month, {
        message: 'from: ожидается YYYY-MM',
    })
    from: string;

    @ApiProperty({
        description:
            'Последний месяц диапазона YYYY-MM включительно. Диапазон ' +
            'шире 24 месяцев отклоняется: столько джоб за раз заливает ' +
            'общую очередь.',
        example: '2026-06',
        type: String,
    })
    @IsString()
    @Matches(AI_ANALYTICS_KEY_PATTERNS.month, {
        message: 'to: ожидается YYYY-MM',
    })
    to: string;

    @ApiPropertyOptional({
        description:
            'Белый список кодов шагов на каждую джобу догона; пусто — все ' +
            'шаги ритма backfill.',
        example: ['calls'],
        type: [String],
        maxItems: AI_ANALYTICS_STEPS_MAX,
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(AI_ANALYTICS_STEPS_MAX)
    @IsString({ each: true, message: 'steps: коды шагов строками' })
    steps?: string[];
}
