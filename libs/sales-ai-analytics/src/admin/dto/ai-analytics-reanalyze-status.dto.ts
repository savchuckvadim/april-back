/**
 * DTO ручки `GET admin/ai-analytics/reanalyze-status` (этап 1B плана
 * 2026-10-19-ai-focus-plan): статус прогона переразбора по периоду и
 * активные отчёты согласия старой и новой версии промпта. Вложенные
 * оценка и отчёт — `ai-analytics-reanalyze-report.dto.ts`.
 */
import { ApiProperty } from '@nestjs/swagger';
import type {
    ReanalysisRunStatus,
    ReanalysisSkipReason,
} from '../../contracts/reanalysis.types';
import type { ReanalyzeStatusResult } from '../services/ai-analytics-reanalyze.service';
import { AiAnalyticsReanalyzePeriodDto } from './ai-analytics-reanalyze.dto';
import {
    AiAnalyticsReanalysisEstimateDto,
    AiAnalyticsVersionAgreementDto,
} from './ai-analytics-reanalyze-report.dto';

/** Запрос статуса — домен и период (те же поля, что у запуска). */
export class AiAnalyticsReanalyzeStatusQueryDto extends AiAnalyticsReanalyzePeriodDto {}

/** Статус прогона переразбора периода. */
export class AiAnalyticsReanalysisRunStatusDto implements ReanalysisRunStatus {
    @ApiProperty({
        description: 'Домен портала.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Начало периода, YYYY-MM-DD.',
        example: '2026-09-01',
        type: String,
    })
    from: string;

    @ApiProperty({
        description: 'Конец периода, YYYY-MM-DD.',
        example: '2026-10-19',
        type: String,
    })
    to: string;

    @ApiProperty({
        description:
            'Сотрудники прогона (Bitrix-id); null — все сотрудники портала.',
        example: [317],
        type: [Number],
        nullable: true,
    })
    userIds: number[] | null;

    @ApiProperty({
        description: 'Прогон был оценкой без модели.',
        example: false,
        type: Boolean,
    })
    dryRun: boolean;

    @ApiProperty({
        description: 'Версия промпта, которой переразбирали.',
        example: 'focus-v2.4-2026-10-20',
        type: String,
    })
    promptVersion: string;

    @ApiProperty({
        description:
            'Дата серии сравнимости текущей версии; null — у версии нет даты.',
        example: '2026-09-25',
        type: String,
        nullable: true,
    })
    series: string | null;

    @ApiProperty({
        description: 'Номер последней части цепочки продолжений.',
        example: 2,
        type: Number,
    })
    part: number;

    @ApiProperty({
        description:
            'Кандидатов на момент начала последней части (старая серия или без версий).',
        example: 180,
        type: Number,
    })
    candidates: number;

    @ApiProperty({
        description: 'Переразобрано с начала прогона.',
        example: 120,
        type: Number,
    })
    done: number;

    @ApiProperty({
        description: 'Сбоев с начала прогона (повторяются следующей частью).',
        example: 2,
        type: Number,
    })
    failed: number;

    @ApiProperty({
        description: 'Пропущено при отборе последней части (все причины).',
        example: 540,
        type: Number,
    })
    skipped: number;

    @ApiProperty({
        description:
            'Пропуски по причинам: upToDate — уже текущая серия, noAnalysis — ' +
            'разбора не было, notInRoster — сотрудник не в списке, noActive — ' +
            'все записи замещены.',
        example: {
            upToDate: 500,
            noAnalysis: 30,
            notInRoster: 10,
            noActive: 0,
        },
        type: Object,
    })
    skippedBy: Record<ReanalysisSkipReason, number>;

    @ApiProperty({
        description: 'Токенов потрачено с начала прогона.',
        example: 2210400,
        type: Number,
    })
    tokens: number;

    @ApiProperty({
        description: 'Стоимость с начала прогона, ₽ (по цене портала).',
        example: 3315.6,
        type: Number,
    })
    price: number;

    @ApiProperty({
        description: 'Начало прогона, ISO (UTC).',
        example: '2026-10-20T01:00:00.000Z',
        type: String,
    })
    startedAt: string;

    @ApiProperty({
        description: 'Последнее обновление статуса, ISO (UTC).',
        example: '2026-10-20T01:40:00.000Z',
        type: String,
    })
    updatedAt: string;

    @ApiProperty({
        description: 'Прогон завершён (продолжений не поставлено).',
        example: false,
        type: Boolean,
    })
    finished: boolean;

    @ApiProperty({
        description:
            'Последняя ошибка переразбора звонка; null — ошибок не было.',
        example: null,
        type: String,
        nullable: true,
    })
    lastError: string | null;

    @ApiProperty({
        description:
            'Последняя часть остановилась по бюджету времени (45 мин).',
        example: true,
        type: Boolean,
    })
    timeBudgetHit: boolean;

    @ApiProperty({
        description:
            'jobId поставленного продолжения; null — продолжение не требовалось.',
        example:
            'call-report-reanalyze:gsr.bitrix24.ru:2026-09-01:2026-10-19:run:part-3',
        type: String,
        nullable: true,
    })
    continuedWith: string | null;

    @ApiProperty({
        description:
            'Оценка стоимости (только у dryRun); null — боевой прогон.',
        type: AiAnalyticsReanalysisEstimateDto,
        nullable: true,
    })
    estimate: AiAnalyticsReanalysisEstimateDto | null;
}

/** Ответ ручки статуса переразбора. */
export class AiAnalyticsReanalyzeStatusDto implements ReanalyzeStatusResult {
    @ApiProperty({
        description: 'Домен портала.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Начало периода, YYYY-MM-DD.',
        example: '2026-09-01',
        type: String,
    })
    from: string;

    @ApiProperty({
        description: 'Конец периода, YYYY-MM-DD.',
        example: '2026-10-19',
        type: String,
    })
    to: string;

    @ApiProperty({
        description:
            'Статус прогона периода; null — прогона по этому периоду не было.',
        type: AiAnalyticsReanalysisRunStatusDto,
        nullable: true,
    })
    run: AiAnalyticsReanalysisRunStatusDto | null;

    @ApiProperty({
        description: 'Идентификатор записи ais статуса; null — записи нет.',
        example: '994100',
        type: String,
        nullable: true,
    })
    runRecordId: string | null;

    @ApiProperty({
        description: 'Активные отчёты согласия версий портала, свежие первыми.',
        type: [AiAnalyticsVersionAgreementDto],
    })
    agreement: AiAnalyticsVersionAgreementDto[];

    @ApiProperty({
        description:
            'Подключён ли запуск (очередь CALL_REPORT доступна сборке).',
        example: true,
        type: Boolean,
    })
    runAvailable: boolean;

    @ApiProperty({
        description: 'Порядок действий владельца после прогона.',
        example:
            'Порядок: dryRun → запуск → backfill с forceRefresh → cache/reset.',
        type: String,
    })
    hint: string;
}
