import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AiManagerRowDto } from './ai-manager-row.dto';
import { AiManagerTypeCellDto } from './ai-manager-type-cell.dto';
import { AiObjectionsDto } from './ai-objections.dto';
import { AiAnalyticsEnvelopeDto } from './ai-response-envelope.dto';
import { ReadinessDto } from './readiness.dto';

/** Период обзора в TZ портала. */
export class AiOverviewPeriodDto {
    @ApiProperty({
        description: 'Начало (YYYY-MM-DD), включительно.',
        type: String,
        example: '2026-08-10',
    })
    from: string;

    @ApiProperty({
        description: 'Конец (YYYY-MM-DD), включительно.',
        type: String,
        example: '2026-09-06',
    })
    to: string;

    @ApiProperty({
        description: 'IANA-зона портала, в которой заданы даты.',
        type: String,
        example: 'Europe/Moscow',
    })
    timeZone: string;

    @ApiProperty({
        description: 'Календарных дней периода.',
        type: Number,
        example: 28,
    })
    days: number;

    @ApiProperty({
        description: 'Рабочих дней периода по календарю портала.',
        type: Number,
        example: 20,
    })
    workdays: number;
}

/** Версии разбора последнего разобранного звонка периода (план 5.4). */
export class AiAnalysisVersionsDto {
    @ApiProperty({
        description: 'Версия промпта фокус-анализа; null — версий нет.',
        type: String,
        nullable: true,
        example: 'focus-v2.1-2026-09-05',
    })
    prompt: string | null;

    @ApiProperty({
        description: 'Версия рубрики.',
        type: String,
        nullable: true,
        example: 'rubric-v1-2026-09-05',
    })
    rubric: string | null;

    @ApiProperty({
        description: 'Хэш реестра профилей типов.',
        type: String,
        nullable: true,
        example: 'a1b2c3',
    })
    registry: string | null;

    @ApiProperty({
        description: 'Дата смены атрибуции менеджера.',
        type: String,
        nullable: true,
        example: '2026-08-24',
    })
    attribution: string | null;

    @ApiProperty({
        description: 'Дата смены классификатора типов.',
        type: String,
        nullable: true,
        example: '2026-09-05',
    })
    classifier: string | null;

    @ApiProperty({
        description: 'Сколько разных сигнатур версий встретилось в периоде.',
        type: Number,
        example: 1,
    })
    distinct: number;
}

/** Итог по типу звонка: та же ячейка + число менеджеров. */
export class AiTypeTotalsDto extends AiManagerTypeCellDto {
    @ApiProperty({
        description: 'Сколько менеджеров имеют звонки этого типа.',
        type: Number,
        example: 6,
    })
    managers: number;
}

/** Итоги по типам внутри одного отдела продаж. */
export class AiDepartmentTotalsDto {
    @ApiProperty({
        description: 'Id отдела продаж; null — менеджеры вне ростера.',
        type: Number,
        nullable: true,
        example: 37,
    })
    departmentId: number | null;

    @ApiProperty({
        description: 'Менеджеры отдела в обзоре.',
        type: [String],
        example: ['447', '512'],
    })
    managerIds: string[];

    @ApiProperty({ description: 'Итоги по типам.', type: [AiTypeTotalsDto] })
    totals: AiTypeTotalsDto[];
}

/** Служебная сводка обзора. */
export class AiOverviewMetaDto {
    @ApiProperty({
        description: 'Звонков в телефонии за период (lite-выборка).',
        type: Number,
        example: 640,
    })
    totalCalls: number;

    @ApiProperty({
        description: 'Разобранных сравнимых звонков в слое качества.',
        type: Number,
        example: 410,
    })
    analyzedCalls: number;

    @ApiProperty({
        description: 'Звонков без менеджера (в строки не попали).',
        type: Number,
        example: 12,
    })
    skippedNoManager: number;

    @ApiProperty({
        description: 'Доля other + irrelevant среди разобранных, %.',
        type: Number,
        example: 6.3,
    })
    otherSharePct: number;

    @ApiProperty({
        description: 'Несогласий (feedback disagree) за период.',
        type: Number,
        example: 3,
    })
    disagreementsCount: number;

    @ApiProperty({
        description: 'Результат отдан из кэша.',
        type: Boolean,
        example: true,
    })
    fromCache: boolean;

    @ApiProperty({
        description: 'Момент расчёта (ISO, UTC).',
        type: String,
        example: '2026-09-06T02:31:12.000Z',
    })
    generatedAt: string;

    @ApiProperty({
        description: 'Флаг confirmedOnly запроса (в Фазе 1b не применяется).',
        type: Boolean,
        example: false,
    })
    confirmedOnly: boolean;
}

/** Обзор менеджер × тип за период (план 6.3, ТЗ FR-13). */
export class AiOverviewDto {
    @ApiProperty({ description: 'Период.', type: AiOverviewPeriodDto })
    period: AiOverviewPeriodDto;

    @ApiProperty({ description: 'Готовность витрины.', type: ReadinessDto })
    readiness: ReadinessDto;

    @ApiProperty({
        description: 'Версия кода расчёта (semver).',
        type: String,
        example: 'sam-1.0.0',
    })
    calcVersion: string;

    @ApiProperty({
        description: 'Версии разбора.',
        type: AiAnalysisVersionsDto,
    })
    versions: AiAnalysisVersionsDto;

    @ApiProperty({
        description:
            'Дата (YYYY-MM-DD), с которой разборы сопоставимы; пусто — версий нет.',
        type: String,
        example: '2026-09-05',
    })
    comparableFrom: string;

    @ApiProperty({
        description: 'Строки менеджеров периметра запрашивающего по managerId.',
        type: [AiManagerRowDto],
    })
    managers: AiManagerRowDto[];

    @ApiProperty({
        description: 'Итоги по типам по всему домену (порядок справочника).',
        type: [AiTypeTotalsDto],
    })
    totals: AiTypeTotalsDto[];

    @ApiProperty({
        description: 'Итоги по типам в разрезе отделов продаж.',
        type: [AiDepartmentTotalsDto],
    })
    departmentTotals: AiDepartmentTotalsDto[];

    @ApiProperty({
        description:
            'Сквозной срез возражений (источник для by-type objections).',
        type: AiObjectionsDto,
    })
    objections: AiObjectionsDto;

    @ApiProperty({ description: 'Служебная сводка.', type: AiOverviewMetaDto })
    meta: AiOverviewMetaDto;
}

export class AiOverviewResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiPropertyOptional({
        description:
            'Обзор (при status = ready). При queued/processing результат ' +
            'придёт по WS ai-analytics:overview:done, затем повторить POST.',
        type: AiOverviewDto,
    })
    data?: AiOverviewDto;
}

/**
 * Запись кэша обзора: готовый результат или конверт ошибки процессора
 * (120 с), чтобы промах не ставил джобу заново сразу после падения.
 */
export type AiOverviewCacheEntry =
    | { status: 'ready'; data: AiOverviewDto }
    | { status: 'error'; message: string };
