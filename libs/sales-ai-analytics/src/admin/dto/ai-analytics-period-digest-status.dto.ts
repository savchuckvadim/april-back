/**
 * DTO ручки `GET admin/ai-analytics/period-digest-status` (этап 7.4):
 * настройки итогов периода портала и итог последнего прогона по каждому
 * виду периода (Redis каркаса отчётов РОПу). Запуск —
 * `ai-analytics-period-digest.dto.ts`. Оформление — ai/rules/dto-conventions.md.
 */
import { ApiProperty } from '@nestjs/swagger';
import {
    ROP_PERIOD_KINDS,
    type RopPeriodKind,
} from '@lib/rop-reports/period/rop-period';
import type { RopRunSummary } from '@lib/rop-reports/state/rop-run-summary';
import { DIGEST_PERIOD_KIND } from '../../model/period-digest/period-digest.codes';
import type { DigestPeriodKind } from '../../model/period-digest/period-digest.types';
import type {
    PeriodDigestKindStatus,
    PeriodDigestStatusResult,
} from '../services/ai-analytics-period-digest.service';
import { AiAnalyticsPeriodDigestDomainDto } from './ai-analytics-period-digest.dto';

const KINDS: readonly DigestPeriodKind[] = Object.values(DIGEST_PERIOD_KIND);

/** Статусы итога прогона каркаса отчётов (`ROP_RUN_STATUS`). */
const RUN_STATUSES = ['ran', 'failed'] as const;

/** Запрос состояния — домен портала. */
export class AiAnalyticsPeriodDigestStatusQueryDto extends AiAnalyticsPeriodDigestDomainDto {}

/** Итог последнего прогона периода (каркас отчётов РОПу). */
export class AiAnalyticsPeriodDigestRunSummaryDto implements RopRunSummary {
    @ApiProperty({
        description: 'Вид периода (у итогов периода — week или month).',
        enum: ROP_PERIOD_KINDS,
        example: DIGEST_PERIOD_KIND.month,
    })
    kind: RopPeriodKind;

    @ApiProperty({
        description: 'Ключ периода.',
        example: '2026-10',
        type: String,
    })
    periodKey: string;

    @ApiProperty({
        description: 'Момент прогона, ISO.',
        example: '2026-11-17T10:05:00.000Z',
        type: String,
    })
    at: string;

    @ApiProperty({
        description: 'ran — дошёл до конца, failed — упал (причина в error).',
        enum: RUN_STATUSES,
        example: 'ran',
    })
    status: (typeof RUN_STATUSES)[number];

    @ApiProperty({
        description: 'Только подсчёт: задачи не ставились.',
        example: true,
        type: Boolean,
    })
    countOnly: boolean;

    @ApiProperty({
        description: 'Проба одному сотруднику.',
        example: false,
        type: Boolean,
    })
    preview: boolean;

    @ApiProperty({
        description: 'Получателей, которым положена задача.',
        example: 0,
        type: Number,
    })
    recipients: number;

    @ApiProperty({ description: 'Задач поставлено.', example: 0, type: Number })
    tasksCreated: number;

    @ApiProperty({
        description: 'Задач, уже стоявших с прошлой попытки.',
        example: 0,
        type: Number,
    })
    tasksAlreadyDone: number;

    @ApiProperty({
        description: 'Прошлых задач закрыто.',
        example: 0,
        type: Number,
    })
    tasksClosed: number;

    @ApiProperty({
        description: 'Строки итога для людей: менеджеры, данные, рекомендации.',
        example: ['Менеджеров: 12, карточек сохранено: 12'],
        type: [String],
    })
    summary: readonly string[];

    @ApiProperty({
        description: 'Предупреждения прогона (не больше десяти).',
        example: [],
        type: [String],
    })
    warnings: readonly string[];

    @ApiProperty({
        description: 'Причина сбоя; null — прогон дошёл до конца.',
        example: null,
        type: String,
        nullable: true,
    })
    error: string | null;
}

/** Последний прогон одного вида периода. */
export class AiAnalyticsPeriodDigestKindStatusDto
    implements PeriodDigestKindStatus
{
    @ApiProperty({
        description: 'Вид периода.',
        enum: KINDS,
        example: DIGEST_PERIOD_KIND.week,
    })
    kind: DigestPeriodKind;

    @ApiProperty({
        description:
            'Итог последнего прогона; null — прогонов не было (или истёк).',
        type: AiAnalyticsPeriodDigestRunSummaryDto,
        nullable: true,
    })
    lastRun: AiAnalyticsPeriodDigestRunSummaryDto | null;
}

/** Состояние итогов периода портала. */
export class AiAnalyticsPeriodDigestStatusDto
    implements PeriodDigestStatusResult
{
    @ApiProperty({
        description: 'Домен портала.',
        example: 'garant.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Включены ли итоги периода в настройках event-sales.',
        example: false,
        type: Boolean,
    })
    enabled: boolean;

    @ApiProperty({
        description: '«Только считать» в настройках портала.',
        example: true,
        type: Boolean,
    })
    countOnly: boolean;

    @ApiProperty({
        description: 'Отмеченные в настройках виды периодов.',
        enum: KINDS,
        isArray: true,
        example: [DIGEST_PERIOD_KIND.week, DIGEST_PERIOD_KIND.month],
    })
    kinds: DigestPeriodKind[];

    @ApiProperty({
        description: 'Последний прогон по каждому виду периода.',
        type: [AiAnalyticsPeriodDigestKindStatusDto],
    })
    runs: AiAnalyticsPeriodDigestKindStatusDto[];

    @ApiProperty({
        description: 'Можно ли поставить подсчёт (очередь подключена).',
        example: true,
        type: Boolean,
    })
    runAvailable: boolean;

    @ApiProperty({
        description: 'Подсказка для админки: что делает подсчёт сейчас.',
        example: 'Пока работает только подсчёт…',
        type: String,
    })
    hint: string;
}
