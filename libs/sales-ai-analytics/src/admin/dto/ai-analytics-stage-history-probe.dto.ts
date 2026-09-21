import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator';
import type { StageHistoryProbeResult } from '../stage-history-probe.service';

/** Границы и умолчание окна пробы истории стадий. */
export const AI_ANALYTICS_STAGE_HISTORY_PROBE_DEFAULTS = {
    months: 12,
    minMonths: 1,
    maxMonths: 36,
} as const;

/** Запрос пробы истории стадий сделок портала (только SUPER_USER). */
export class AiAnalyticsStageHistoryProbeQueryDto {
    @ApiProperty({
        description:
            'Домен портала Bitrix24, у которого проверяется доступность ' +
            'crm.stagehistory.list и глубина истории стадий сделок.',
        example: 'april.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty({ message: 'domain обязателен' })
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim().toLowerCase() : value,
    )
    domain: string;

    @ApiPropertyOptional({
        description:
            'Окно пробы в месяцах назад от момента запроса: за него ' +
            'считаются переходы стадий, и с ним же сравнивается глубина ' +
            'истории (enough). 1–36, по умолчанию 12 — столько просит ' +
            'AI-аналитика ОП.',
        example: AI_ANALYTICS_STAGE_HISTORY_PROBE_DEFAULTS.months,
        type: Number,
        minimum: AI_ANALYTICS_STAGE_HISTORY_PROBE_DEFAULTS.minMonths,
        maximum: AI_ANALYTICS_STAGE_HISTORY_PROBE_DEFAULTS.maxMonths,
        default: AI_ANALYTICS_STAGE_HISTORY_PROBE_DEFAULTS.months,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'months должно быть целым числом' })
    @Min(AI_ANALYTICS_STAGE_HISTORY_PROBE_DEFAULTS.minMonths)
    @Max(AI_ANALYTICS_STAGE_HISTORY_PROBE_DEFAULTS.maxMonths)
    months?: number;
}

/** Ответ GET admin/ai-analytics/stage-history/probe. */
export class AiAnalyticsStageHistoryProbeResponseDto
    implements StageHistoryProbeResult
{
    @ApiProperty({
        description: 'Домен портала, по которому сделана проба.',
        example: 'april.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Момент пробы, ISO (UTC).',
        example: '2026-09-21T09:00:00.000Z',
        type: String,
    })
    checkedAt: string;

    @ApiProperty({
        description:
            'Метод crm.stagehistory.list ответил без ошибки: у ключа есть ' +
            'права/scope crm и метод на портале доступен. false — см. error.',
        example: true,
        type: Boolean,
    })
    available: boolean;

    @ApiProperty({
        description:
            'Текст ошибки Bitrix (нет прав или scope, метод недоступен, ' +
            'сеть); null — ошибок нет.',
        example: null,
        type: String,
        nullable: true,
    })
    error: string | null;

    @ApiProperty({
        description:
            'Идентификатор (bitrixId) категории (воронки) sales_base ' +
            'портала, которой сужена проба — так же, как у загрузчика ' +
            'AI-аналитики. null — категория не настроена, проба сделана ' +
            'по всем воронкам сделок.',
        example: 4,
        type: Number,
        nullable: true,
    })
    categoryBitrixId: number | null;

    @ApiProperty({
        description:
            'CREATED_TIME самой ранней записи истории (ISO с поясом ' +
            'портала); null — записей нет.',
        example: '2024-06-15T10:00:00+03:00',
        type: String,
        nullable: true,
    })
    earliestAt: string | null;

    @ApiProperty({
        description:
            'Глубина истории: полных месяцев от самой ранней записи до ' +
            'момента пробы (неполный месяц не засчитывается); null — ' +
            'записей нет.',
        example: 27,
        type: Number,
        nullable: true,
    })
    historyMonths: number | null;

    @ApiProperty({
        description:
            'Сколько переходов стадий сделок было за последние windowMonths ' +
            'месяцев; null — метод недоступен.',
        example: 1234,
        type: Number,
        nullable: true,
    })
    transitionsInWindow: number | null;

    @ApiProperty({
        description:
            'Bitrix не вернул total, и transitionsInWindow равен размеру ' +
            'первой страницы (до 50) — это нижняя граница, а не точное число.',
        example: false,
        type: Boolean,
    })
    countIsLowerBound: boolean;

    @ApiProperty({
        description: 'Окно пробы в месяцах (параметр months запроса).',
        example: AI_ANALYTICS_STAGE_HISTORY_PROBE_DEFAULTS.months,
        type: Number,
    })
    windowMonths: number;

    @ApiProperty({
        description:
            'Итог для владельца: метод доступен и глубина истории не меньше ' +
            'окна — шаг StageHistoryStep AI-аналитики будет считаться по ' +
            'живым данным, а не деградировать.',
        example: true,
        type: Boolean,
    })
    enough: boolean;

    @ApiProperty({
        description:
            'Человекочитаемый вывод пробы: доступность, глубина, переходов ' +
            'за окно, замечание о ненастроенной категории или текст ошибки.',
        example:
            'история доступна, глубина 27 мес., переходов за окно 12 мес. — 1234',
        type: String,
    })
    hint: string;
}
