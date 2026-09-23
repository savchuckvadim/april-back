/**
 * DTO ручки `POST admin/ai-analytics/retention/run` (план Фазы 3, П5;
 * решения владельца B7/B10 и В8 от 22.09.2026): что политика удалила бы
 * по дескрипторам типов и что реально сделано.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator';
import {
    AI_ANALYTICS_SNAPSHOT_TYPES,
    AiAnalyticsSnapshotType,
} from '../../contracts/snapshot-kinds.const';
import {
    RETENTION_REASONS,
    RetentionReason,
    RetentionTypeSummary,
    RetentionVictim,
} from '../ai-analytics-retention.policy';
import {
    AI_ANALYTICS_RETENTION_DEFAULTS,
    RETENTION_RUN_STATUSES,
    RetentionRunResult,
    RetentionRunStatus,
} from '../services/ai-analytics-retention.service';

/** Границы примеров в ответе. */
export const AI_ANALYTICS_RETENTION_SAMPLE = { min: 0, max: 200 } as const;

/** Запуск ретенции по домену. */
export class AiAnalyticsRetentionRunDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24, по которому считать ретенцию.',
        example: 'april.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty({ message: 'domain обязателен' })
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim().toLowerCase() : value,
    )
    domain: string;

    @ApiPropertyOptional({
        description:
            'Только посчитать, ничего не удаляя. По умолчанию true — ' +
            'ручка безопасна при случайном вызове. false означает ' +
            '«запуск всерьёз»: сводка уходит одной строкой в чат админов ' +
            '(решение владельца В8).',
        example: AI_ANALYTICS_RETENTION_DEFAULTS.dryRun,
        type: Boolean,
        default: AI_ANALYTICS_RETENTION_DEFAULTS.dryRun,
    })
    @IsOptional()
    @IsBoolean({ message: 'dryRun должно быть булевым' })
    dryRun?: boolean;

    @ApiPropertyOptional({
        description:
            'Сколько записей-кандидатов показать примерами в ответе ' +
            '(0–200). По умолчанию 20 — ответ остаётся читаемым.',
        example: AI_ANALYTICS_RETENTION_DEFAULTS.sampleLimit,
        type: Number,
        minimum: AI_ANALYTICS_RETENTION_SAMPLE.min,
        maximum: AI_ANALYTICS_RETENTION_SAMPLE.max,
        default: AI_ANALYTICS_RETENTION_DEFAULTS.sampleLimit,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'sampleLimit должно быть целым числом' })
    @Min(AI_ANALYTICS_RETENTION_SAMPLE.min)
    @Max(AI_ANALYTICS_RETENTION_SAMPLE.max)
    sampleLimit?: number;
}

/** Итог по одному типу снапшотов. */
export class AiAnalyticsRetentionTypeDto implements RetentionTypeSummary {
    @ApiProperty({
        description: 'Тип снапшота (колонка type записи ais).',
        example: 'ai-analytics-etl-run',
        type: String,
        enum: AI_ANALYTICS_SNAPSHOT_TYPES,
    })
    type: AiAnalyticsSnapshotType;

    @ApiProperty({
        description:
            'Единица ретенции из дескриптора типа: records — хранить N ' +
            'записей на субъекта, days — N дней от создания, forever — ' +
            'бессрочно (такие типы в план не попадают).',
        example: 'days',
        type: String,
    })
    unit: string;

    @ApiProperty({
        description: 'Число записей или дней по дескриптору; null — forever.',
        example: 90,
        type: Number,
        nullable: true,
    })
    value: number | null;

    @ApiProperty({
        description: 'Записей типа просмотрено в окне.',
        example: 120,
        type: Number,
    })
    scanned: number;

    @ApiProperty({
        description: 'Записей типа попало под удаление.',
        example: 30,
        type: Number,
    })
    victims: number;
}

/** Запись-кандидат на удаление. */
export class AiAnalyticsRetentionVictimDto implements RetentionVictim {
    @ApiProperty({
        description: 'Идентификатор записи ais.',
        example: '901233',
        type: String,
    })
    id: string;

    @ApiProperty({
        description: 'Тип снапшота записи.',
        example: 'ai-analytics-forecast',
        type: String,
        enum: AI_ANALYTICS_SNAPSHOT_TYPES,
    })
    type: AiAnalyticsSnapshotType;

    @ApiProperty({
        description: 'Ключ периода записи (колонка activity_id).',
        example: '2026-02-14',
        type: String,
    })
    periodKey: string;

    @ApiProperty({
        description: 'Менеджер записи; null — портальное зерно.',
        example: '154',
        type: String,
        nullable: true,
    })
    managerId: string | null;

    @ApiProperty({
        description: 'Момент создания записи.',
        example: '2026-02-14T01:12:00.000Z',
        type: Date,
    })
    createdAt: Date;

    @ApiProperty({
        description:
            'Почему запись под удаление: expired-days — старше срока ' +
            'хранения типа, over-count — сверх числа периодов субъекта, ' +
            'old-version — лишняя версия ключа сверх двух удерживаемых.',
        example: RETENTION_REASONS.expiredDays,
        type: String,
        enum: Object.values(RETENTION_REASONS),
    })
    reason: RetentionReason;
}

/** Ответ запуска ретенции. */
export class AiAnalyticsRetentionResultDto implements RetentionRunResult {
    @ApiProperty({
        description: 'Домен портала.',
        example: 'april.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Режим запуска: true — только расчёт.',
        example: true,
        type: Boolean,
    })
    dryRun: boolean;

    @ApiProperty({
        description:
            'Исход запуска: planned — посчитано без удаления, ' +
            'delete-not-available — удаление запрошено, но метода delete ' +
            'у ais-репозитория ещё нет, поэтому ничего не удалено.',
        example: RETENTION_RUN_STATUSES.planned,
        type: String,
        enum: Object.values(RETENTION_RUN_STATUSES),
    })
    status: RetentionRunStatus;

    @ApiProperty({
        description: 'Момент расчёта, ISO (UTC).',
        example: '2026-09-22T04:30:00.000Z',
        type: String,
    })
    checkedAt: string;

    @ApiProperty({
        description: 'Записей просмотрено в окне чтения.',
        example: 1840,
        type: Number,
    })
    scanned: number;

    @ApiProperty({
        description: 'Записей под удаление по политике.',
        example: 212,
        type: Number,
    })
    total: number;

    @ApiProperty({
        description:
            'Фактически удалено записей. Пока всегда 0: физического ' +
            'удаления нет (см. status).',
        example: 0,
        type: Number,
    })
    deleted: number;

    @ApiProperty({
        description: 'Разрез по типам: сроки хранения, просмотр и кандидаты.',
        type: [AiAnalyticsRetentionTypeDto],
    })
    byType: AiAnalyticsRetentionTypeDto[];

    @ApiProperty({
        description: 'Примеры записей под удаление (не больше sampleLimit).',
        type: [AiAnalyticsRetentionVictimDto],
    })
    sample: AiAnalyticsRetentionVictimDto[];

    @ApiProperty({
        description:
            'Одна строка сводки — она же уходит в чат админов при ' +
            'запуске с dryRun = false.',
        example:
            'Ретенция AI-аналитики april.bitrix24.ru: расчёт (dryRun); ' +
            'просмотрено 1840, под удаление 212; по типам: ' +
            'ai-analytics-etl-run 120, ai-analytics-forecast 92',
        type: String,
    })
    summary: string;
}
