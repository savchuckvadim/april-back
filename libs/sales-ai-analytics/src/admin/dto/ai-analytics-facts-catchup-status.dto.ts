/**
 * DTO ручки `GET admin/ai-analytics/facts-catchup-status` (этап B4):
 * статус прогона догона фактов v3.1 по периоду. Оценка стоимости — тот же
 * DTO, что у переразбора (`ai-analytics-reanalyze-report.dto.ts`).
 */
import { ApiProperty } from '@nestjs/swagger';
import type {
    FactsCatchupRunStatus,
    FactsCatchupSkipReason,
} from '../../contracts/facts-catchup.types';
import type { FactsCatchupStatusResult } from '../services/ai-analytics-facts-catchup.service';
import { AiAnalyticsReanalyzePeriodDto } from './ai-analytics-reanalyze.dto';
import { AiAnalyticsReanalysisEstimateDto } from './ai-analytics-reanalyze-report.dto';

/** Запрос статуса — домен и период (те же поля, что у запуска). */
export class AiAnalyticsFactsCatchupStatusQueryDto extends AiAnalyticsReanalyzePeriodDto {}

/** Статус прогона догона фактов периода. */
export class AiAnalyticsFactsCatchupRunStatusDto
    implements FactsCatchupRunStatus
{
    @ApiProperty({
        description: 'Домен портала.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Начало периода, YYYY-MM-DD.',
        example: '2026-10-01',
        type: String,
    })
    from: string;

    @ApiProperty({
        description: 'Конец периода, YYYY-MM-DD.',
        example: '2026-10-31',
        type: String,
    })
    to: string;

    @ApiProperty({
        description: 'Прогон был подсчётом без модели.',
        example: false,
        type: Boolean,
    })
    dryRun: boolean;

    @ApiProperty({
        description: 'Версия промпта догона, которой шёл прогон.',
        example: 'facts-v1-2026-11-10',
        type: String,
    })
    promptVersion: string;

    @ApiProperty({
        description: 'Номер части цепочки продолжений, с 1.',
        example: 1,
        type: Number,
    })
    part: number;

    @ApiProperty({
        description: 'Разборов без фактов на старте последней части.',
        example: 120,
        type: Number,
    })
    candidates: number;

    @ApiProperty({
        description: 'Догнано с начала прогона.',
        example: 80,
        type: Number,
    })
    done: number;

    @ApiProperty({
        description: 'Сбоев с начала прогона.',
        example: 2,
        type: Number,
    })
    failed: number;

    @ApiProperty({
        description: 'Пропущено при отборе (всего).',
        example: 300,
        type: Number,
    })
    skipped: number;

    @ApiProperty({
        description:
            'Пропуски по причинам: hasFacts — факты уже есть, noAnalysis — ' +
            'разбора не было, noActive — активной записи нет.',
        example: { hasFacts: 290, noAnalysis: 10, noActive: 0 },
        type: Object,
    })
    skippedBy: Record<FactsCatchupSkipReason, number>;

    @ApiProperty({
        description: 'Токены с начала прогона.',
        example: 96000,
        type: Number,
    })
    tokens: number;

    @ApiProperty({
        description: 'Стоимость с начала прогона, ₽.',
        example: 48.5,
        type: Number,
    })
    price: number;

    @ApiProperty({
        description: 'Начало прогона, ISO.',
        example: '2026-11-10T06:00:00.000Z',
        type: String,
    })
    startedAt: string;

    @ApiProperty({
        description: 'Последнее обновление статуса, ISO.',
        example: '2026-11-10T06:20:00.000Z',
        type: String,
    })
    updatedAt: string;

    @ApiProperty({
        description:
            'Прогон закончен: кандидатов не осталось либо это был подсчёт.',
        example: false,
        type: Boolean,
    })
    finished: boolean;

    @ApiProperty({
        description: 'Последняя ошибка; null — сбоев не было.',
        example: null,
        type: String,
        nullable: true,
    })
    lastError: string | null;

    @ApiProperty({
        description: 'Часть упёрлась в бюджет времени.',
        example: false,
        type: Boolean,
    })
    timeBudgetHit: boolean;

    @ApiProperty({
        description:
            'Идентификатор джобы поставленного продолжения; null — ' +
            'продолжение не нужно.',
        example:
            'call-report-facts-catchup:gsr.bitrix24.ru:2026-10-01:2026-10-31:run:part-2',
        type: String,
        nullable: true,
    })
    continuedWith: string | null;

    @ApiProperty({
        description: 'Оценка стоимости подсчёта; null — боевой прогон.',
        type: AiAnalyticsReanalysisEstimateDto,
        nullable: true,
    })
    estimate: AiAnalyticsReanalysisEstimateDto | null;

    @ApiProperty({
        description: 'Всего звонков прогона — знаменатель «догнано N из M».',
        example: 200,
        type: Number,
    })
    total: number;

    @ApiProperty({
        description: 'Чистое время обработки с начала прогона, мс.',
        example: 600000,
        type: Number,
    })
    processingMs: number;

    @ApiProperty({
        description: 'Оценка оставшегося времени, минут; null — нечем оценить.',
        example: 12,
        type: Number,
        nullable: true,
    })
    etaMinutes: number | null;

    @ApiProperty({
        description: 'Звонков одновременно сейчас.',
        example: 3,
        type: Number,
    })
    concurrency: number;

    @ApiProperty({
        description: 'Часть остановлена серией сбоев — нужен повторный запуск.',
        example: false,
        type: Boolean,
    })
    stopped: boolean;
}

/** Ответ ручки статуса догона. */
export class AiAnalyticsFactsCatchupStatusDto
    implements FactsCatchupStatusResult
{
    @ApiProperty({
        description: 'Домен портала.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Начало периода, YYYY-MM-DD.',
        example: '2026-10-01',
        type: String,
    })
    from: string;

    @ApiProperty({
        description: 'Конец периода, YYYY-MM-DD.',
        example: '2026-10-31',
        type: String,
    })
    to: string;

    @ApiProperty({
        description:
            'Статус прогона периода; null — прогона по этому периоду не было.',
        type: AiAnalyticsFactsCatchupRunStatusDto,
        nullable: true,
    })
    run: AiAnalyticsFactsCatchupRunStatusDto | null;

    @ApiProperty({
        description: 'Идентификатор записи ais статуса; null — записи нет.',
        example: '994100',
        type: String,
        nullable: true,
    })
    runRecordId: string | null;

    @ApiProperty({
        description: 'Очередь подключена — запуск возможен.',
        example: true,
        type: Boolean,
    })
    runAvailable: boolean;

    @ApiProperty({
        description: 'Подсказка по порядку действий владельца после прогона.',
        example:
            'Порядок: подсчёт (dryRun) → запуск → после finished: true — ' +
            'отчёт собственнику за период пересобрать с forceRefresh.',
        type: String,
    })
    hint: string;
}
