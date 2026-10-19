/**
 * DTO вложенных частей статуса переразбора (этап 1B плана
 * 2026-10-19-ai-focus-plan): оценка стоимости dryRun и отчёт согласия
 * старой и новой версии промпта с разбивкой по старой версии.
 * Сам статус и ответ ручки — `ai-analytics-reanalyze-status.dto.ts`.
 */
import { ApiProperty } from '@nestjs/swagger';
import type { ReanalysisCostEstimate } from '../../contracts/reanalysis.types';
import type {
    VersionAgreementBreakdownEntry,
    VersionAgreementEntry,
    VersionAgreementShift,
} from '../services/ai-analytics-reanalyze.service';

/** Оценка стоимости dryRun по недавним разборам домена. */
export class AiAnalyticsReanalysisEstimateDto
    implements ReanalysisCostEstimate
{
    @ApiProperty({
        description:
            'Записей agent-analysis с учётом токенов, по которым считано среднее.',
        example: 412,
        type: Number,
    })
    basedOnRecords: number;

    @ApiProperty({
        description:
            'Средний расход токенов одного разбора; null — оценки нет.',
        example: 18420,
        type: Number,
        nullable: true,
    })
    avgTokens: number | null;

    @ApiProperty({
        description: 'Средняя стоимость одного разбора, ₽; null — оценки нет.',
        example: 27.63,
        type: Number,
        nullable: true,
    })
    avgPrice: number | null;

    @ApiProperty({
        description:
            'Ожидаемый расход токенов на всех кандидатов; null — оценки нет.',
        example: 1842000,
        type: Number,
        nullable: true,
    })
    estimatedTokens: number | null;

    @ApiProperty({
        description: 'Ожидаемая стоимость прогона, ₽; null — оценки нет.',
        example: 2763,
        type: Number,
        nullable: true,
    })
    estimatedPrice: number | null;

    @ApiProperty({
        description: 'Пояснение оценки словами (в том числе «оценки нет»).',
        example:
            'Среднее по 412 недавним разборам: 18420 токенов, 27.63 ₽ за звонок.',
        type: String,
    })
    message: string;
}

/** Средний сдвиг оценки раздела «новая − старая». */
export class AiAnalyticsVersionShiftDto implements VersionAgreementShift {
    @ApiProperty({
        description: 'Код шкалы раздела рубрики (section_<код>).',
        example: 'section_NEEDS',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Пар, где раздел оценён обоими разборами.',
        example: 96,
        type: Number,
    })
    n: number;

    @ApiProperty({
        description: 'Средний сдвиг оценки раздела; null — пар нет.',
        example: -0.4,
        type: Number,
        nullable: true,
    })
    meanShift: number | null;
}

/** Разбивка согласия по старой версии промпта. */
export class AiAnalyticsVersionBreakdownDto
    implements VersionAgreementBreakdownEntry
{
    @ApiProperty({
        description: 'Версия промпта старых разборов (none — версий не было).',
        example: 'focus-v2.2-2026-09-08',
        type: String,
    })
    promptVersion: string;

    @ApiProperty({
        description: 'Пар «старый разбор — переразбор».',
        example: 120,
        type: Number,
    })
    pairs: number;

    @ApiProperty({
        description: 'ICC(2,1) общего балла; null — меньше двух пар.',
        example: 0.71,
        type: Number,
        nullable: true,
    })
    icc21: number | null;

    @ApiProperty({
        description: 'ICC(3,1) общего балла; null — меньше двух пар.',
        example: 0.78,
        type: Number,
        nullable: true,
    })
    icc31: number | null;

    @ApiProperty({
        description:
            'σ общего балла (sd разностей / √2); null — меньше двух пар.',
        example: 0.62,
        type: Number,
        nullable: true,
    })
    sigma: number | null;

    @ApiProperty({
        description:
            'Средний сдвиг общего балла «новая − старая» (шкала 1–10).',
        example: -0.3,
        type: Number,
        nullable: true,
    })
    meanShift: number | null;

    @ApiProperty({
        description: 'Средние сдвиги оценок разделов.',
        type: [AiAnalyticsVersionShiftDto],
    })
    sectionShifts: AiAnalyticsVersionShiftDto[];
}

/** Отчёт согласия версий в составе статуса. */
export class AiAnalyticsVersionAgreementDto implements VersionAgreementEntry {
    @ApiProperty({
        description: 'Идентификатор записи ais отчёта.',
        example: '994200',
        type: String,
    })
    id: string;

    @ApiProperty({
        description: 'Ключ отчёта: старая серия → текущая версия.',
        example: '2026-09-08->focus-v2.4-2026-10-20',
        type: String,
    })
    key: string;

    @ApiProperty({
        description: 'Дата серии старых разборов (none — версий не было).',
        example: '2026-09-08',
        type: String,
    })
    fromSeries: string;

    @ApiProperty({
        description: 'Текущая версия промпта.',
        example: 'focus-v2.4-2026-10-20',
        type: String,
    })
    toPromptVersion: string;

    @ApiProperty({ description: 'Пар всего.', example: 120, type: Number })
    pairs: number;

    @ApiProperty({
        description: 'σ_llm общего отчёта к применению.',
        example: 0.62,
        type: Number,
    })
    sigmaLlm: number;

    @ApiProperty({
        description: 'Источник σ_llm: measured | configured.',
        example: 'configured',
        type: String,
    })
    sigmaSource: string;

    @ApiProperty({
        description:
            'ICC(2,1) общего балла по всем парам; null — меньше двух пар.',
        example: 0.71,
        type: Number,
        nullable: true,
    })
    icc21: number | null;

    @ApiProperty({
        description: 'Разбивка по старой версии промпта.',
        type: [AiAnalyticsVersionBreakdownDto],
    })
    byOldPromptVersion: AiAnalyticsVersionBreakdownDto[];

    @ApiProperty({
        description: 'Момент формирования отчёта, ISO (UTC).',
        example: '2026-10-20T01:40:00.000Z',
        type: String,
    })
    generatedAt: string;
}
