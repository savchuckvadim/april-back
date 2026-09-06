import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    AI_ANALYTICS_BUCKETS,
    AiAnalyticsBucket,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import {
    AI_ANALYTICS_EXPLANATION_SOURCES,
    AiAnalyticsExplanationSource,
} from '../constants/ai-overview.const';
import { MetricDto } from './metric.dto';

/** Объяснение раздела рубрики за период (шаблон кода, без LLM). */
export class AiSectionExplanationDto {
    @ApiProperty({
        description:
            'Текст: «Раздел «работа по цене»: 4,2/10 (n = 11, применимость 72 %)» ' +
            'либо «мало данных (n = …)» при n < 8.',
        type: String,
        example: 'Раздел «работа по цене»: 4,2/10 (n = 11, применимость 72 %).',
    })
    text: string;

    @ApiProperty({
        description: 'Машиночитаемые опоры чисел текста (code=value).',
        type: [String],
        example: ['section=PRICE:4.2:n=11', 'relevance=72'],
    })
    basis: string[];

    @ApiProperty({
        description:
            'Id звонков-опор раздела. В Фазе 1b пусто: опорные звонки ' +
            'считаются на ячейку (explanation.evidenceCallIds).',
        type: [String],
        example: [],
    })
    evidenceCallIds: string[];
}

/** Раздел рубрики за период: только relevance > 0, собственное n. */
export class AiCellSectionDto {
    @ApiProperty({
        description: 'Код раздела (GREETING, NEEDS, PRICE, …).',
        type: String,
        example: 'PRICE',
    })
    section: string;

    @ApiProperty({
        description:
            'Подпись раздела из справочника; неизвестный код — как есть.',
        type: String,
        example: 'Работа по цене',
    })
    title: string;

    @ApiProperty({
        description: 'Средняя оценка раздела 1–10; null при n < 8.',
        type: Number,
        nullable: true,
        example: 4.2,
    })
    avgScore: number | null;

    @ApiProperty({
        description: 'Оценённых звонков раздела (relevance > 0).',
        type: Number,
        example: 11,
    })
    n: number;

    @ApiProperty({
        description: 'Средняя применимость раздела 0–100 по оценённым звонкам.',
        type: Number,
        example: 72,
    })
    avgRelevance: number;

    @ApiPropertyOptional({
        description: 'Разрыв до нормы уровня (Фаза 2; сейчас не отдаётся).',
        type: Number,
        example: -1.3,
    })
    gapToLevel?: number;

    @ApiProperty({
        description: 'Объяснение раздела.',
        type: AiSectionExplanationDto,
    })
    explanation: AiSectionExplanationDto;
}

/** Чек-листы ячейки, доли в процентах (Уилсон 90 %, ok при n ≥ 30). */
export class AiCellChecklistsDto {
    @ApiProperty({
        description: 'Доля разобранных звонков с назначенным шагом и датой, %.',
        type: MetricDto,
    })
    nextStepDateRatePct: MetricDto;

    @ApiPropertyOptional({
        description:
            'Доля презентаций с «Хвостом», %. Отдаётся, когда загрузчик ' +
            'несёт флаг (в lite-строках Фазы 1b его нет).',
        type: MetricDto,
    })
    hvostDonePct?: MetricDto;

    @ApiPropertyOptional({
        description: 'Доля презентаций с «5К», % (аналогично hvostDonePct).',
        type: MetricDto,
    })
    fiveKDonePct?: MetricDto;

    @ApiPropertyOptional({
        description:
            'Доля отработанных возражений менеджера по всем типам, % — ' +
            'отдаётся в ячейке типа refine.',
        type: MetricDto,
    })
    handledRatePct?: MetricDto;
}

/** Факт самоотчёта по KPI-коду типа (карта AI_ANALYTICS_EVENT_KINDS). */
export class AiCellKpiDto {
    @ApiProperty({
        description: 'Код item-а event_type KPI-списка sales_kpi.',
        type: String,
        example: 'presentation_uniq',
    })
    code: string;

    @ApiProperty({
        description:
            'Факт done за период (сумма по месяцам); null — типу нечего ' +
            'считать или item отсутствует (см. reason).',
        type: Number,
        nullable: true,
        example: 23,
    })
    fact: number | null;

    @ApiPropertyOptional({
        description:
            'Причина отсутствия факта: kpiReason карты (refine-mapped-to-call, ' +
            'other-share-in-meta) либо kpi-item-missing:{code}.',
        type: String,
        example: 'refine-mapped-to-call',
    })
    reason?: string;

    @ApiPropertyOptional({
        description:
            'План CRM по коду за период (call_plan, presentation_*_plan).',
        type: Number,
        example: 30,
    })
    planCrm?: number;

    @ApiPropertyOptional({
        description:
            'План руководителя (UF_USR_A_SALES_PLAN_*) для кода: calls_done → ' +
            'call, presentations_done → presentation_uniq.',
        type: Number,
        example: 40,
    })
    planHead?: number;
}

/** Три опорных звонка ячейки по оценке. */
export class AiEvidenceCallIdsDto {
    @ApiProperty({
        description: 'Id транскрипции лучшего звонка; null — оценок нет.',
        type: String,
        nullable: true,
        example: '10245',
    })
    best: string | null;

    @ApiProperty({
        description: 'Id транскрипции худшего звонка.',
        type: String,
        nullable: true,
        example: '10101',
    })
    worst: string | null;

    @ApiProperty({
        description: 'Id транскрипции медианного звонка.',
        type: String,
        nullable: true,
        example: '10180',
    })
    median: string | null;
}

/** Объяснение оценки ячейки (ТЗ FR-23). */
export class AiCellExplanationDto {
    @ApiProperty({
        description:
            'Источник текста: template — шаблон кода (Фаза 1b), llm — по ' +
            'кнопке с факт-чеком чисел (Фаза 2).',
        enum: AI_ANALYTICS_EXPLANATION_SOURCES,
        example: 'template',
    })
    source: AiAnalyticsExplanationSource;

    @ApiProperty({
        description:
            '«Оценка 6,4/10 (n = 18). Сильно: … Слабо: … Изменение … Совет: …»; ' +
            'при n < 8 — «мало данных (n = …)». Слово «значимо» не используется.',
        type: String,
        example: 'Оценка 6,4/10 (n = 18). Сильно: приветствие 8,1 (n = 18). …',
    })
    text: string;

    @ApiProperty({
        description:
            'Опоры каждого числа текста (code=value, точка-разделитель).',
        type: [String],
        example: ['score=6.4', 'n=18', 'strong=GREETING:8.1:n=18'],
    })
    basis: string[];

    @ApiProperty({
        description: 'Опорные звонки: лучший, худший, медианный.',
        type: AiEvidenceCallIdsDto,
    })
    evidenceCallIds: AiEvidenceCallIdsDto;
}

/** Ячейка менеджер × тип звонка за период (план 6.3, ТЗ FR-22). */
export class AiManagerTypeCellDto {
    @ApiProperty({
        description: 'AI-тип звонка (CALL_REPORT_CALL_TYPE_CODES).',
        type: String,
        example: 'presentation',
    })
    callType: string;

    @ApiProperty({
        description: 'Подпись типа из карты алфавитов.',
        type: String,
        example: 'Презентация',
    })
    title: string;

    @ApiProperty({
        description:
            'Корзина оценок типа; null — тип в оценках не участвует ' +
            '(other / irrelevant).',
        enum: AI_ANALYTICS_BUCKETS,
        nullable: true,
        example: 'presentation',
    })
    bucket: AiAnalyticsBucket | null;

    @ApiProperty({
        description:
            'Разобранных сравнимых звонков типа (с разбором, менеджером, не ' +
            'короче 300 с, не раньше comparableFrom).',
        type: Number,
        example: 18,
    })
    n: number;

    @ApiProperty({
        description:
            'Звонков до comparableFrom (в оценки не смешиваются, план 5.4).',
        type: Number,
        example: 4,
    })
    nBeforeComparable: number;

    @ApiProperty({
        description:
            'В сравнимых строках ячейки больше одной сигнатуры версий разбора.',
        type: Boolean,
        example: false,
    })
    versionsMixed: boolean;

    @ApiProperty({
        description: 'Оценка за период: среднее weightedScore/10 при n ≥ 8.',
        type: MetricDto,
    })
    score: MetricDto;

    @ApiProperty({
        description: 'Разделы рубрики с собственным n (только relevance > 0).',
        type: [AiCellSectionDto],
    })
    sections: AiCellSectionDto[];

    @ApiProperty({ description: 'Чек-листы типа.', type: AiCellChecklistsDto })
    checklists: AiCellChecklistsDto;

    @ApiProperty({
        description:
            'Факты самоотчёта по KPI-кодам типа в порядке карты; суммировать ' +
            'нельзя (у презентаций три пересекающихся среза).',
        type: [AiCellKpiDto],
    })
    kpi: AiCellKpiDto[];

    @ApiProperty({
        description:
            'Главный KPI-факт типа (kpiPrimaryEventTypeCode карты); null — ' +
            'типу нечего считать.',
        type: AiCellKpiDto,
        nullable: true,
    })
    primaryKpi: AiCellKpiDto | null;

    @ApiProperty({
        description:
            'Почему у типа нет главного KPI-факта: kpiReason карты ' +
            '(refine-mapped-to-call, other-share-in-meta) либо ' +
            'kpi-item-missing:{code}; null — факт есть.',
        type: String,
        nullable: true,
        example: null,
    })
    kpiReason: string | null;

    @ApiProperty({
        description: 'Объяснение оценки ячейки.',
        type: AiCellExplanationDto,
    })
    explanation: AiCellExplanationDto;
}
