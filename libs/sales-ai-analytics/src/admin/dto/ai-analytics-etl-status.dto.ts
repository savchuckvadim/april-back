/**
 * Ответ ручки `GET admin/ai-analytics/etl-status` (план Фазы 3, П5):
 * последние журналы ночного конвейера (`ai-analytics-etl-run`) домена —
 * шаги, пропуски, объёмы и метрики прогона. Запрос — в соседнем файле
 * `ai-analytics-etl-status-query.dto.ts` (лимит 300 строк).
 */
import { ApiProperty } from '@nestjs/swagger';
import type {
    EtlStatusResult,
    EtlStatusRun,
    EtlStatusStep,
    EtlStatusSummary,
} from '../services/ai-analytics-etl-status.service';
import { AI_ANALYTICS_ETL_STATUS_DEFAULTS } from './ai-analytics-etl-status-query.dto';

/** Шаг прогона в журнале. */
export class AiAnalyticsEtlStepDto implements EtlStatusStep {
    @ApiProperty({
        description: 'Код шага конвейера (calls, kpi, stage-history…).',
        example: 'stage-history',
        type: String,
    })
    step: string;

    @ApiProperty({
        description:
            'Исход шага: ok — отработал, skipped — штатно пропущен ' +
            '(причина в reason), failed — упал (текст в error).',
        example: 'skipped',
        type: String,
    })
    status: string;

    @ApiProperty({
        description: 'Длительность шага, миллисекунды.',
        example: 4210,
        type: Number,
    })
    durationMs: number;

    @ApiProperty({
        description: 'Строк источников, загруженных шагом.',
        example: 1834,
        type: Number,
    })
    rowsLoaded: number;

    @ApiProperty({
        description: 'Вызовов Bitrix REST на шаге.',
        example: 12,
        type: Number,
    })
    bitrixCalls: number;

    @ApiProperty({
        description: 'Снапшотов записано шагом.',
        example: 7,
        type: Number,
    })
    written: number;

    @ApiProperty({
        description:
            'Причина пропуска (stage-history-too-short и т. п.); null — ' +
            'шаг не пропускался.',
        example: 'stage-history-too-short',
        type: String,
        nullable: true,
    })
    reason: string | null;

    @ApiProperty({
        description: 'Текст ошибки при status = failed; иначе null.',
        example: null,
        type: String,
        nullable: true,
    })
    error: string | null;
}

/** Один прогон конвейера. */
export class AiAnalyticsEtlRunDto implements EtlStatusRun {
    @ApiProperty({
        description: 'Идентификатор записи журнала в таблице ais.',
        example: '918233',
        type: String,
    })
    id: string;

    @ApiProperty({
        description: 'День прогона YYYY-MM-DD в часовом поясе портала.',
        example: '2026-09-21',
        type: String,
    })
    day: string;

    @ApiProperty({
        description:
            'Ритм прогона: nightly, weekly, monthly, backfill. Пустая ' +
            'строка — журнал старой формы без ритма.',
        example: 'nightly',
        type: String,
    })
    rhythm: string;

    @ApiProperty({
        description:
            'Исход прогона: ok — все шаги прошли, partial — были ' +
            'пропуски, failed — падение шага.',
        example: 'partial',
        type: String,
    })
    status: string;

    @ApiProperty({
        description: 'Длительность всего прогона, миллисекунды.',
        example: 51230,
        type: Number,
    })
    durationMs: number;

    @ApiProperty({
        description: 'Суммарно загружено строк источников за прогон.',
        example: 12043,
        type: Number,
    })
    rowsLoaded: number;

    @ApiProperty({
        description: 'Суммарно вызовов Bitrix REST за прогон.',
        example: 86,
        type: Number,
    })
    bitrixCalls: number;

    @ApiProperty({
        description:
            'Входы прогона отличаются от прошлого (сменился inputsHash) — ' +
            'причина, по которой числа периода могли поехать.',
        example: false,
        type: Boolean,
    })
    inputsDrift: boolean;

    @ApiProperty({
        description: 'Шаги прогона в порядке выполнения.',
        type: [AiAnalyticsEtlStepDto],
    })
    steps: AiAnalyticsEtlStepDto[];

    @ApiProperty({
        description: 'Коды штатно пропущенных шагов (быстрый разрез).',
        example: ['stage-history'],
        type: [String],
    })
    skipped: string[];

    @ApiProperty({
        description: 'Коды упавших шагов (быстрый разрез).',
        example: [],
        type: [String],
    })
    failed: string[];

    @ApiProperty({
        description: 'Предупреждения прогона (санити-панель, календарь).',
        example: ['exposure: у 2 менеджеров нет рабочих дней месяца'],
        type: [String],
    })
    warnings: string[];

    @ApiProperty({
        description:
            'Метрики прогона (ai_analytics_job_duration, _rows_loaded, ' +
            '_bitrix_calls, _llm_price) — те же значения, что уходят в ' +
            'Prometheus.',
        example: {
            ai_analytics_job_duration: 51.23,
            ai_analytics_rows_loaded: 12043,
            ai_analytics_bitrix_calls: 86,
            ai_analytics_llm_price: 0,
        },
        type: Object,
    })
    metrics: Record<string, number>;

    @ApiProperty({
        description: 'Момент формирования журнала, ISO (UTC).',
        example: '2026-09-21T00:47:12.000Z',
        type: String,
    })
    generatedAt: string;

    @ApiProperty({
        description: 'Версия кода расчёта, которым шёл прогон.',
        example: 'p2.4',
        type: String,
    })
    calcVersion: string;

    @ApiProperty({
        description: 'Версия набора параметров модели на момент прогона.',
        example: 'r7-3f2a9c1d',
        type: String,
    })
    paramsVersion: string;
}

/** Сводка окна. */
export class AiAnalyticsEtlSummaryDto implements EtlStatusSummary {
    @ApiProperty({
        description: 'Прогонов в окне.',
        example: 7,
        type: Number,
    })
    runs: number;

    @ApiProperty({
        description: 'Прогонов без пропусков и падений.',
        example: 5,
        type: Number,
    })
    ok: number;

    @ApiProperty({
        description: 'Прогонов с пропущенными шагами (штатная деградация).',
        example: 2,
        type: Number,
    })
    partial: number;

    @ApiProperty({
        description: 'Прогонов с упавшими шагами.',
        example: 0,
        type: Number,
    })
    failed: number;

    @ApiProperty({
        description: 'Суммарно строк источников за окно.',
        example: 84301,
        type: Number,
    })
    rowsLoaded: number;

    @ApiProperty({
        description: 'Суммарно вызовов Bitrix REST за окно.',
        example: 602,
        type: Number,
    })
    bitrixCalls: number;

    @ApiProperty({
        description: 'Прогонов с дрейфом входов.',
        example: 1,
        type: Number,
    })
    drifted: number;
}

/** Ответ ручки состояния конвейера. */
export class AiAnalyticsEtlStatusResultDto implements EtlStatusResult {
    @ApiProperty({
        description: 'Домен портала.',
        example: 'april.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Глубина окна в днях, по которой собран ответ.',
        example: AI_ANALYTICS_ETL_STATUS_DEFAULTS.days,
        type: Number,
    })
    days: number;

    @ApiProperty({
        description: 'Момент формирования ответа, ISO (UTC).',
        example: '2026-09-22T08:15:00.000Z',
        type: String,
    })
    checkedAt: string;

    @ApiProperty({
        description: 'Сводка окна: исходы прогонов и суммы объёмов.',
        type: AiAnalyticsEtlSummaryDto,
    })
    summary: AiAnalyticsEtlSummaryDto;

    @ApiProperty({
        description: 'Прогоны окна, свежие первыми.',
        type: [AiAnalyticsEtlRunDto],
    })
    runs: AiAnalyticsEtlRunDto[];
}
