/**
 * DTO ручки `GET admin/ai-analytics/deal-movement-status` (этап 7.3):
 * ход и итог последнего прогона движения сделок (Redis) и последний
 * дневной снимок ночного счёта (ais). Оформление — ai/rules/dto-conventions.md.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    DEAL_MOVEMENT_RUN_MODES,
    DEAL_MOVEMENT_RUN_PHASES,
    type DealMovementRunMode,
    type DealMovementRunPhase,
    type DealMovementRunStatus,
} from '../../contracts/deal-movement-run.types';
import type {
    DealMovementSnapshotChange,
    DealMovementSnapshotPayload,
} from '../../contracts/deal-movement-snapshot.types';
import {
    DEAL_MOVEMENT_STATUSES,
    type DealMovementStatus,
} from '../../model/deal-movement/deal-movement.types';
import type { DealMovementStatusResult } from '../services/ai-analytics-deal-movement.service';
import { AiAnalyticsDealMovementDomainDto } from './ai-analytics-deal-movement.dto';
import { AiAnalyticsDealMovementNotesDto } from './ai-analytics-deal-movement-notes.dto';

/** Запрос состояния — домен портала. */
export class AiAnalyticsDealMovementStatusQueryDto extends AiAnalyticsDealMovementDomainDto {}

/** Сколько сделок в каждом статусе. */
export class AiAnalyticsDealMovementCountsDto
    implements Record<DealMovementStatus, number>
{
    @ApiProperty({ description: 'Движется.', example: 7000, type: Number })
    moving: number;

    @ApiProperty({ description: 'Застряла.', example: 1500, type: Number })
    stuck: number;

    @ApiProperty({ description: 'Откатилась.', example: 12, type: Number })
    rolled_back: number;

    @ApiProperty({ description: 'Под риском.', example: 480, type: Number })
    at_risk: number;
}

/** Ход и итог последнего прогона портала. */
export class AiAnalyticsDealMovementRunStatusDto
    implements DealMovementRunStatus
{
    @ApiProperty({
        description: 'Домен портала.',
        example: 'garant.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description:
            'Режим: dry-run — подсчёт без сохранения и без записи, count — ' +
            'счёт с сохранением (в ленту сделок пишет только ночной счёт и ' +
            'только если запись включена).',
        enum: DEAL_MOVEMENT_RUN_MODES,
        example: 'count',
        type: String,
    })
    mode: DealMovementRunMode;

    @ApiProperty({
        description: 'Кто поставил прогон: nightly — крон, admin — админка.',
        example: 'nightly',
        type: String,
    })
    requestedBy: string;

    @ApiProperty({
        description: 'Фаза прогона: где он сейчас или чем закончился.',
        enum: DEAL_MOVEMENT_RUN_PHASES,
        example: 'done',
        type: String,
    })
    phase: DealMovementRunPhase;

    @ApiProperty({
        description: 'Начало прогона, ISO.',
        example: '2026-11-17T23:27:00.000Z',
        type: String,
    })
    startedAt: string;

    @ApiProperty({
        description: 'Последнее обновление хода, ISO.',
        example: '2026-11-17T23:31:12.000Z',
        type: String,
    })
    updatedAt: string;

    @ApiProperty({
        description: 'Прогон закончен (удачно или нет).',
        example: true,
        type: Boolean,
    })
    finished: boolean;

    @ApiProperty({
        description: 'Открытых сделок «ОП Основная» на портале.',
        example: 9012,
        type: Number,
    })
    openTotal: number;

    @ApiProperty({
        description: 'Сколько из них оценено (потолок ночи).',
        example: 9012,
        type: Number,
    })
    evaluated: number;

    @ApiProperty({
        description: 'Сработал потолок сделок за ночь.',
        example: false,
        type: Boolean,
    })
    capped: boolean;

    @ApiProperty({
        description:
            'Счёт шёл как базовая линия: прошлого состояния нет или оно ' +
            'старше трёх суток — смены статуса не считались.',
        example: false,
        type: Boolean,
    })
    baseline: boolean;

    @ApiProperty({
        description: 'Сделок, увиденных впервые.',
        example: 14,
        type: Number,
    })
    firstSeen: number;

    @ApiProperty({
        description: 'Сколько сделок в каждом статусе.',
        type: AiAnalyticsDealMovementCountsDto,
    })
    byStatus: AiAnalyticsDealMovementCountsDto;

    @ApiProperty({
        description: 'Сколько сделок сменили статус за ночь.',
        example: 123,
        type: Number,
    })
    changed: number;

    @ApiProperty({
        description:
            'День сохранённого снимка YYYY-MM-DD; null — снимок не писался (подсчёт).',
        example: '2026-11-18',
        type: String,
        nullable: true,
    })
    snapshotDay: string | null;

    @ApiPropertyOptional({
        description:
            'Записи в ленту сделок за прогон (у подсчёта — сколько записали ' +
            'бы); нет у прогонов до 17.11.2026.',
        type: AiAnalyticsDealMovementNotesDto,
    })
    notes?: AiAnalyticsDealMovementNotesDto;

    @ApiProperty({
        description:
            'Предупреждения прогона по-русски (потолок, недочитанная история).',
        example: [],
        type: [String],
    })
    warnings: string[];

    @ApiProperty({
        description: 'Почему прогон не удался; null — удался или ещё идёт.',
        example: null,
        type: String,
        nullable: true,
    })
    error: string | null;
}

/** Смена статуса сделки за ночь. */
export class AiAnalyticsDealMovementChangeDto
    implements DealMovementSnapshotChange
{
    @ApiProperty({
        description: 'Номер сделки в Битриксе.',
        example: '9041',
        type: String,
    })
    dealId: string;

    @ApiProperty({
        description: 'Название сделки.',
        example: 'ООО «Ромашка»',
        type: String,
    })
    title: string;

    @ApiProperty({
        description: 'Ответственный (Bitrix ID); null — не задан.',
        example: 42,
        type: Number,
        nullable: true,
    })
    assignedById: number | null;

    @ApiProperty({
        description: 'Сумма сделки; null — не указана.',
        example: 150000,
        type: Number,
        nullable: true,
    })
    amount: number | null;

    @ApiProperty({
        description: 'Статус прошлой ночи.',
        enum: DEAL_MOVEMENT_STATUSES,
        example: 'moving',
        type: String,
    })
    from: DealMovementStatus;

    @ApiProperty({
        description: 'Статус этой ночи.',
        enum: DEAL_MOVEMENT_STATUSES,
        example: 'at_risk',
        type: String,
    })
    to: DealMovementStatus;

    @ApiProperty({
        description: 'Причины нового статуса словами, по-русски.',
        example: ['договорились на 10.11 — контакта после этого не было'],
        type: [String],
    })
    reasons: string[];

    @ApiPropertyOptional({
        description:
            'Записана ли смена в ленту сделки этим прогоном; нет у снимков до 17.11.2026.',
        example: true,
        type: Boolean,
    })
    notified?: boolean;
}

/** Дневной снимок ночного счёта. */
export class AiAnalyticsDealMovementSnapshotDto
    implements DealMovementSnapshotPayload
{
    @ApiProperty({
        description: 'День портала YYYY-MM-DD.',
        example: '2026-11-18',
        type: String,
    })
    day: string;

    @ApiProperty({
        description: 'Режим счёта.',
        enum: DEAL_MOVEMENT_RUN_MODES,
        example: 'count',
        type: String,
    })
    mode: DealMovementRunMode;

    @ApiProperty({
        description: 'Версия расчёта.',
        example: 'deal-movement-1.0.0',
        type: String,
    })
    calcVersion: string;

    @ApiProperty({
        description: 'Момент формирования, ISO.',
        example: '2026-11-17T23:31:12.000Z',
        type: String,
    })
    generatedAt: string;

    @ApiProperty({
        description: 'Открытых сделок на портале.',
        example: 9012,
        type: Number,
    })
    openTotal: number;

    @ApiProperty({
        description: 'Оценено сделок.',
        example: 9012,
        type: Number,
    })
    evaluated: number;

    @ApiProperty({
        description: 'Счёт шёл как базовая линия.',
        example: false,
        type: Boolean,
    })
    baseline: boolean;

    @ApiProperty({
        description: 'Сделок, увиденных впервые.',
        example: 14,
        type: Number,
    })
    firstSeen: number;

    @ApiProperty({
        description: 'Сколько сделок в каждом статусе.',
        type: AiAnalyticsDealMovementCountsDto,
    })
    byStatus: AiAnalyticsDealMovementCountsDto;

    @ApiProperty({
        description: 'Смены статуса за ночь (не больше тысячи).',
        type: [AiAnalyticsDealMovementChangeDto],
    })
    changes: AiAnalyticsDealMovementChangeDto[];

    @ApiProperty({
        description: 'Всего смен статуса за ночь.',
        example: 123,
        type: Number,
    })
    changesTotal: number;

    @ApiPropertyOptional({
        description:
            'Записи в ленту сделок за прогон; нет у снимков до 17.11.2026.',
        type: AiAnalyticsDealMovementNotesDto,
    })
    notes?: AiAnalyticsDealMovementNotesDto;

    @ApiProperty({
        description: 'Предупреждения счёта по-русски.',
        example: [],
        type: [String],
    })
    warnings: string[];
}

/** Состояние движения сделок портала. */
export class AiAnalyticsDealMovementStatusDto
    implements DealMovementStatusResult
{
    @ApiProperty({
        description: 'Домен портала.',
        example: 'garant.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description:
            'Включён ли ночной счёт на портале (настройка приложения event-sales).',
        example: true,
        type: Boolean,
    })
    enabled: boolean;

    @ApiProperty({
        description:
            'Ход и итог последнего прогона; null — прогонов не было или сведения истекли (14 суток).',
        type: AiAnalyticsDealMovementRunStatusDto,
        nullable: true,
    })
    run: AiAnalyticsDealMovementRunStatusDto | null;

    @ApiProperty({
        description:
            'Последний сохранённый дневной снимок; null — ночного счёта ещё не было.',
        type: AiAnalyticsDealMovementSnapshotDto,
        nullable: true,
    })
    lastSnapshot: AiAnalyticsDealMovementSnapshotDto | null;

    @ApiProperty({
        description: 'Подключена ли очередь — можно ли ставить прогон.',
        example: true,
        type: Boolean,
    })
    runAvailable: boolean;

    @ApiProperty({
        description: 'Подсказка порядка действий.',
        example: 'Порядок: «Посчитать» → …',
        type: String,
    })
    hint: string;
}
