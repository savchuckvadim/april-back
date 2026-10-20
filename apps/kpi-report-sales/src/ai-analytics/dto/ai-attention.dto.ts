import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    ATTENTION_SIGNALS,
    AttentionAvailableFrom,
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
            'Код опоры: needs_section_mean, presentation_section_mean, ' +
            'objections_section_mean, closing_section_mean (средняя раздела ' +
            '1–10, норма — порог или средняя отдела), objection_unhandled_share, ' +
            'next_step_no_date_share (доли 0..1), low_score_calls (число ' +
            'звонков, норма — порог оценки), risk_calls, analyzed_calls, ' +
            'calls_total, call_plan_done_share, next_step_date_rate, plan_head, …',
        type: String,
        example: 'needs_section_mean',
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

/** Звонок карточки (риск, слабая презентация / доработка, низкая оценка) со ссылкой на разбор. */
export class AiAttentionCallLinkDto {
    @ApiProperty({
        description: 'Id транскрипции звонка карточки.',
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
        description:
            'AI-тип звонка (подвкладка), если сигнал про тип: presentation у ' +
            'слабых презентаций, refine у слабой доработки, call у дисциплины.',
        type: String,
        example: 'presentation',
    })
    callType?: string;

    @ApiPropertyOptional({
        description:
            'Id транскрипций звонков карточки: риск-звонки (risk), слабые ' +
            'презентации (weak_presentation), слабая доработка (weak_followup), ' +
            'звонки с низкой оценкой (low_score_calls).',
        type: [String],
        example: ['10245', '10301'],
    })
    transcriptionIds?: string[];

    @ApiPropertyOptional({
        description:
            'Звонки карточки со ссылками на разборы (те же id, что в ' +
            'transcriptionIds) — кнопка «Открыть разбор» на карточке.',
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
            'Сигнал в порядке приоритета (решение владельца 19.10.2026): ' +
            'weak_presentation — у презентаций слабы «Выявление потребностей» ' +
            'или «Презентация под потребности» (средняя ≤ weak_section_score_max ' +
            'либо ниже отдела на weak_section_gap при n ≥ 8); weak_followup — у ' +
            'доработки (refine / decision) возражения не отработаны или шаг без ' +
            'даты в половине случаев и чаще либо слабы «Работа с возражениями» / ' +
            '«Закрытие разговора»; low_score_calls — звонки с общей оценкой ≤ ' +
            'low_score_call_max; no_data — n < 8 при звонках; discipline — < 50 % ' +
            'плана CRM при плане ≥ 10; next_step_drop — падение доли «шаг с ' +
            'датой» при n ≥ 20 в обоих окнах; plan_gap — план руководителя vs ' +
            'норма (с Фазы 2); risk — последним: действующие риск-флаги с цитатой ' +
            '(conflict / compliance / door_closed) и срочный коучинг. Фаза 3: ' +
            'goodhart — метрика давления растёт, противовес падает; ' +
            'trend_shift / trend_drift — сдвиг уровня или дрейф ряда вниз.',
        enum: ATTENTION_SIGNALS,
        example: 'weak_presentation',
    })
    signal: AttentionSignal;

    @ApiProperty({
        description:
            'С какой фазы доступен сигнал: 1 — правила Фазы 1, 3 — тренды ' +
            'и детектор Гудхарта.',
        type: Number,
        enum: [1, 3],
        example: 1,
    })
    availableFrom: AttentionAvailableFrom;

    @ApiProperty({
        description: 'Заголовок карточки с числами (по-русски, без кодов).',
        type: String,
        example:
            'Слабые презентации: «Выявление потребностей» 4,3 из 10 — в среднем по 12 разборам презентаций',
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
