import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Метаданные построенного отчёта: что построили, по каким фильтрам,
 * из кэша ли, сохранили ли в историю. Присутствуют в каждом отчёте.
 */
export class CallReportAnalyticsMetaDto {
    @ApiProperty({
        description: 'Вид отчёта.',
        example: 'summary',
        type: String,
    })
    report: string;

    @ApiProperty({
        description: 'Домен портала.',
        example: 'april-garant.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Начало периода (ISO).',
        example: '2026-07-01T00:00:00.000Z',
        type: String,
    })
    from: string;

    @ApiProperty({
        description: 'Конец периода (ISO).',
        example: '2026-07-23T23:59:59.000Z',
        type: String,
    })
    to: string;

    @ApiProperty({
        description: 'Применённые фильтры (эхо запроса).',
        type: Object,
        example: { managerId: '7', callType: 'cold' },
    })
    filters: Record<string, unknown>;

    @ApiProperty({
        description: 'Всего звонков конвейера в периоде (до фильтров).',
        example: 120,
        type: Number,
    })
    totalCalls: number;

    @ApiProperty({
        description: 'Звонков после применения фильтров — база отчёта.',
        example: 95,
        type: Number,
    })
    filteredCalls: number;

    @ApiProperty({
        description:
            'Из них с глубоким анализом агента (agent-analysis) — по ним ' +
            'считаются оценки/разделы/возражения.',
        example: 80,
        type: Number,
    })
    analyzedCalls: number;

    @ApiProperty({
        description:
            'Отброшено фильтром по менеджеру из-за отсутствия менеджера в ' +
            'строке (звонки, обработанные до включения сохранения менеджера).',
        example: 3,
        type: Number,
    })
    skippedNoManager: number;

    @ApiProperty({
        description: 'Отчёт отдан из кэша (true) или пересчитан (false).',
        example: false,
        type: Boolean,
    })
    fromCache: boolean;

    @ApiProperty({
        description: 'Момент построения отчёта (ISO).',
        example: '2026-07-23T18:00:00.000Z',
        type: String,
    })
    generatedAt: string;

    @ApiPropertyOptional({
        description:
            'ID записи истории в ais (если запрошено saveToHistory). ' +
            'null — сохранение не запрашивалось или не удалось.',
        example: '211',
        type: String,
        nullable: true,
    })
    historyId?: string | null;
}

/** Разрез по одному разделу разговора (усреднение по анализам агента). */
export class CallReportSectionStatDto {
    @ApiProperty({
        description: 'Код раздела (GREETING/NEEDS/…).',
        example: 'OBJECTIONS',
        type: String,
    })
    section: string;

    @ApiProperty({
        description: 'Средняя оценка раздела 1-10 (по relevance>0).',
        example: 6.4,
        type: Number,
    })
    avgScore: number;

    @ApiProperty({
        description: 'Средняя актуальность раздела 0-100.',
        example: 78,
        type: Number,
    })
    avgRelevance: number;

    @ApiProperty({
        description: 'Число анализов, где раздел был актуален (relevance>0).',
        example: 61,
        type: Number,
    })
    count: number;
}

/** Сводный отчёт за период: объёмы, типы, результативность, оценки. */
export class CallReportSummaryReportDto {
    @ApiProperty({ type: CallReportAnalyticsMetaDto })
    meta: CallReportAnalyticsMetaDto;

    @ApiProperty({
        description: 'Распределение по типам звонков (код → число звонков).',
        type: Object,
        example: { cold: 40, presentation: 12, unknown: 5 },
    })
    byCallType: Record<string, number>;

    @ApiProperty({
        description:
            'Результативность: productive / nonProductive / unknown (нет анализа).',
        type: Object,
        example: { productive: 30, nonProductive: 50, unknown: 15 },
    })
    productivity: Record<string, number>;

    @ApiProperty({
        description: 'Средняя оценка звонка 1-10 (по анализам агента).',
        example: 6.2,
        type: Number,
        nullable: true,
    })
    avgScore: number | null;

    @ApiProperty({
        description: 'Средняя взвешенная оценка 0-100.',
        example: 61,
        type: Number,
        nullable: true,
    })
    avgWeightedScore: number | null;

    @ApiProperty({
        description:
            'Доля звонков с назначенным следующим шагом, % (ключевой предиктор).',
        example: 44,
        type: Number,
        nullable: true,
    })
    nextStepSetRatePct: number | null;

    @ApiProperty({
        description: 'Средняя длительность звонка, сек.',
        example: 540,
        type: Number,
        nullable: true,
    })
    avgDurationSec: number | null;

    @ApiProperty({
        description: 'Число звонков по менеджерам (bitrix-id → звонки).',
        type: Object,
        example: { '7': 42, '15': 38, unknown: 15 },
    })
    byManager: Record<string, number>;
}

/** Отчёт речевой аналитики: метрики речи и разрезы по разделам. */
export class CallReportSpeechReportDto {
    @ApiProperty({ type: CallReportAnalyticsMetaDto })
    meta: CallReportAnalyticsMetaDto;

    @ApiProperty({
        description: 'Средняя доля речи менеджера, %.',
        example: 54,
        type: Number,
        nullable: true,
    })
    avgTalkRatioPct: number | null;

    @ApiProperty({
        description:
            'Звонков вне нормы доли речи для своего типа (нормы — ' +
            'CALL_REPORT_TYPE_PROFILES; типы без нормы не учитываются).',
        example: 12,
        type: Number,
    })
    talkRatioOutOfNorm: number;

    @ApiProperty({
        description: 'Среднее число вопросов менеджера за звонок.',
        example: 8.5,
        type: Number,
        nullable: true,
    })
    avgQuestionsCount: number | null;

    @ApiProperty({
        description: 'Среднее соответствие скрипту, %.',
        example: 67,
        type: Number,
        nullable: true,
    })
    avgScriptCompliance: number | null;

    @ApiProperty({
        description: 'Средние оценки/актуальность по разделам разговора.',
        type: [CallReportSectionStatDto],
    })
    sections: CallReportSectionStatDto[];
}

/** Отчёт по возражениям, конкурентам и рискам за период. */
export class CallReportObjectionsReportDto {
    @ApiProperty({ type: CallReportAnalyticsMetaDto })
    meta: CallReportAnalyticsMetaDto;

    @ApiProperty({
        description: 'Частоты категорий возражений (код справочника → число).',
        type: Object,
        example: { price: 25, need: 18 },
    })
    objectionCategories: Record<string, number>;

    @ApiProperty({
        description:
            'Доля успешно отработанных возражений, % (по objections[].handled).',
        example: 38,
        type: Number,
        nullable: true,
    })
    handledRatePct: number | null;

    @ApiProperty({
        description: 'Частоты упоминаний конкурентов.',
        type: Object,
        example: { consultant: 14, free_internet: 6 },
    })
    competitors: Record<string, number>;

    @ApiProperty({
        description: 'Частоты риск-флагов (алерты РОПу).',
        type: Object,
        example: { promise: 2, client_negative: 1 },
    })
    riskFlags: Record<string, number>;

    @ApiProperty({
        description: 'Частоты категорий отказов (рыночные vs исполнительские).',
        type: Object,
        example: { price: 6, execution_issue: 4 },
    })
    refusalCategories: Record<string, number>;
}

/** Строка рейтинга менеджера в отчёте по сотрудникам. */
export class CallReportManagerStatDto {
    @ApiProperty({
        description:
            'Bitrix-id менеджера; "unknown" — звонки без сохранённого менеджера.',
        example: '7',
        type: String,
    })
    managerId: string;

    @ApiProperty({
        description: 'Звонков за период.',
        example: 42,
        type: Number,
    })
    calls: number;

    @ApiProperty({
        description: 'Из них с глубоким анализом агента.',
        example: 36,
        type: Number,
    })
    analyzed: number;

    @ApiProperty({
        description: 'Средняя взвешенная оценка 0-100.',
        example: 63,
        type: Number,
        nullable: true,
    })
    avgWeightedScore: number | null;

    @ApiProperty({
        description: 'Доля результативных звонков, %.',
        example: 35,
        type: Number,
        nullable: true,
    })
    productiveRatePct: number | null;

    @ApiProperty({
        description: 'Средняя доля речи менеджера, %.',
        example: 52,
        type: Number,
        nullable: true,
    })
    avgTalkRatioPct: number | null;
}

/** Отчёт по менеджерам: рейтинг по взвешенной оценке. */
export class CallReportManagersReportDto {
    @ApiProperty({ type: CallReportAnalyticsMetaDto })
    meta: CallReportAnalyticsMetaDto;

    @ApiProperty({
        description:
            'Менеджеры с их метриками, отсортированы по avgWeightedScore убыв.',
        type: [CallReportManagerStatDto],
    })
    managers: CallReportManagerStatDto[];
}

/** Результат сброса кэша отчётов. */
export class CallReportAnalyticsCacheResetResponseDto {
    @ApiProperty({
        description: 'Сколько ключей кэша удалено.',
        example: 4,
        type: Number,
    })
    removedKeys: number;

    @ApiProperty({
        description: 'Использованный шаблон ключей.',
        example: 'call-report:analytics:summary:april-garant.bitrix24.ru:*',
        type: String,
    })
    pattern: string;
}
