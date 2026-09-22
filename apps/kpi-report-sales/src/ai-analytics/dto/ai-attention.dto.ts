import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    ATTENTION_SIGNALS,
    AttentionBasis,
    AttentionItem,
    AttentionLink,
    AttentionSignal,
} from '@lib/sales-ai-analytics';
import { AiOverviewFiltersDto } from './ai-overview-request.dto';
import { AiAnalyticsEnvelopeDto } from './ai-response-envelope.dto';

/** Опора карточки «Внимания»: код, значение, норма, n. */
export class AiAttentionBasisDto implements AttentionBasis {
    @ApiProperty({
        description:
            'Код опоры: risk_calls, analyzed_calls, calls_total, ' +
            'call_plan_done_share, next_step_date_rate, plan_head, …',
        type: String,
        example: 'call_plan_done_share',
    })
    code: string;

    @ApiProperty({
        description: 'Значение (доля 0..1, число звонков, план).',
        type: Number,
        example: 0.2,
    })
    value: number;

    @ApiPropertyOptional({
        description: 'Норма/порог, с которым сравнивается значение.',
        type: Number,
        example: 0.5,
    })
    norm?: number;

    @ApiProperty({
        description: 'Объём данных; 0 — значение из настройки.',
        type: Number,
        example: 20,
    })
    n: number;

    @ApiPropertyOptional({
        description: '90 %-й интервал Уилсона для долей.',
        type: [Number],
        example: [0.31, 0.49],
    })
    ci90?: [number, number];
}

/** Риск-звонок карточки со ссылкой на его разбор. */
export class AiAttentionCallLinkDto {
    @ApiProperty({
        description: 'Id транскрипции риск-звонка.',
        type: String,
        example: '10245',
    })
    transcriptionId: string;

    @ApiProperty({
        description:
            'Ссылка на карточку разбора в смарт-процессе «AI-анализ звонков» ' +
            'портала; null — элемента разбора ещё нет или смарт не установлен.',
        type: String,
        nullable: true,
        example: 'https://april.bitrix24.ru/crm/type/1036/details/128/',
    })
    link: string | null;
}

/** Куда ведёт карточка: менеджер, тип, звонки. */
export class AiAttentionLinkDto implements AttentionLink {
    @ApiProperty({
        description: 'Bitrix-id менеджера.',
        type: String,
        example: '512',
    })
    managerId: string;

    @ApiPropertyOptional({
        description: 'AI-тип звонка (подвкладка), если сигнал про тип.',
        type: String,
        example: 'call',
    })
    callType?: string;

    @ApiPropertyOptional({
        description: 'Id транскрипций риск-звонков (сигнал risk).',
        type: [String],
        example: ['10245', '10301'],
    })
    transcriptionIds?: string[];

    @ApiPropertyOptional({
        description:
            'Риск-звонки со ссылками на разборы (те же id, что в transcriptionIds) — ' +
            'кнопка «Открыть разбор» на карточке. Только у сигнала risk.',
        type: [AiAttentionCallLinkDto],
    })
    calls?: AiAttentionCallLinkDto[];
}

/** Карточка «Внимания» (план 6.3, ТЗ FR-12). */
export class AiAttentionItemDto implements AttentionItem {
    @ApiProperty({
        description: 'Bitrix-id менеджера.',
        type: String,
        example: '512',
    })
    managerId: string;

    @ApiProperty({
        description: 'Ранг карточки с 1.',
        type: Number,
        example: 1,
    })
    rank: number;

    @ApiProperty({
        description:
            'Сигнал Фазы 1: risk — риск-звонки; no_data — n < 8 при звонках; ' +
            'discipline — < 50 % плана CRM при плане ≥ 10; next_step_drop — ' +
            'падение доли «шаг с датой» при n ≥ 20 в обоих окнах; plan_gap — ' +
            'план руководителя vs норма (с Фазы 2).',
        enum: ATTENTION_SIGNALS,
        example: 'discipline',
    })
    signal: AttentionSignal;

    @ApiProperty({
        description: 'С какой фазы доступен сигнал (все правила — Фаза 1).',
        type: Number,
        example: 1,
    })
    availableFrom: 1;

    @ApiProperty({
        description: 'Заголовок карточки с числами.',
        type: String,
        example: 'Дисциплина CRM: звонки 4 из 20 (20 %)',
    })
    headline: string;

    @ApiProperty({
        description: 'Опоры карточки.',
        type: [AiAttentionBasisDto],
    })
    basis: AiAttentionBasisDto[];

    @ApiProperty({ description: 'Ссылка карточки.', type: AiAttentionLinkDto })
    link: AiAttentionLinkDto;
}

/** «Внимание» РОПу над кэшем обзора. */
export class AiAttentionDto {
    @ApiProperty({
        description: 'Начало периода обзора (YYYY-MM-DD).',
        type: String,
        example: '2026-08-10',
    })
    from: string;

    @ApiProperty({
        description: 'Конец периода обзора (YYYY-MM-DD).',
        type: String,
        example: '2026-09-06',
    })
    to: string;

    @ApiProperty({
        description:
            'Не больше 7 карточек, не больше 3 на менеджера, порядок «сигнал → ' +
            'тяжесть → managerId»; только менеджеры периметра запрашивающего.',
        type: [AiAttentionItemDto],
    })
    items: AiAttentionItemDto[];

    @ApiProperty({
        description: 'Сколько менеджеров периметра рассмотрено правилами.',
        type: Number,
        example: 8,
    })
    managersConsidered: number;
}

/** Запрос «Внимания»: те же фильтры, что у обзора. */
export class AiAttentionRequestDto extends AiOverviewFiltersDto {}

export class AiAttentionResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiPropertyOptional({
        description:
            'Карточки (при status = ready). При queued/processing обзор ещё ' +
            'считается — requestKey/jobId относятся к нему.',
        type: AiAttentionDto,
    })
    data?: AiAttentionDto;
}
