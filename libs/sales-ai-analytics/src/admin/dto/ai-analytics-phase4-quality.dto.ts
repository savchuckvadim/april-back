/**
 * Ответ админ-ручки `GET admin/ai-analytics/quality-link` (Фаза 4, поток
 * B3): связь качества разговора с ближним исходом (β) — оценки с
 * интервалами, калибровка, плацебо и гейт публикации.
 */
import { ApiProperty } from '@nestjs/swagger';
import {
    AI_QUALITY_LINK_STATUSES,
    type AiQualityLinkStatus,
} from '../../contracts/snapshot.phase4.types';
import type {
    Phase4QualityLink,
    Phase4QualityLinkView,
} from '../services/ai-analytics-phase4.types';
import { AiAnalyticsPhase4EstimateDto } from './ai-analytics-phase4-pool.dto';

export class AiAnalyticsQualityLinkDto implements Phase4QualityLinkView {
    @ApiProperty({
        description: 'Месяц оценки (YYYY-MM).',
        example: '2026-09',
        type: String,
    })
    monthKey: string;

    @ApiProperty({
        description: 'Момент формирования (ISO, UTC).',
        example: '2026-10-03T01:00:00.000Z',
        type: String,
    })
    generatedAt: string;

    @ApiProperty({
        description: 'Статус: insufficient, estimated или published.',
        enum: AI_QUALITY_LINK_STATUSES,
        example: 'estimated',
    })
    status: AiQualityLinkStatus;

    @ApiProperty({
        description: 'Коды причин статуса и гейта.',
        example: ['se-above-target'],
        type: [String],
    })
    reasons: string[];

    @ApiProperty({
        description: 'Звонков-триггеров с исходом в выборке.',
        example: 412,
        type: Number,
    })
    sampleN: number;

    @ApiProperty({
        description: 'Из них с исходом (КП или счёт в окне).',
        example: 96,
        type: Number,
    })
    sampleEvents: number;

    @ApiProperty({
        description: 'Менеджеров в выборке.',
        example: 7,
        type: Number,
    })
    sampleManagers: number;

    @ApiProperty({
        description: 'Окно ближнего исхода, дней.',
        example: 14,
        type: Number,
    })
    windowDays: number;

    @ApiProperty({
        description: 'β внутри менеджера; null — нет оценки.',
        type: AiAnalyticsPhase4EstimateDto,
        nullable: true,
    })
    within: AiAnalyticsPhase4EstimateDto | null;

    @ApiProperty({
        description: 'β между менеджерами; null — нет оценки.',
        type: AiAnalyticsPhase4EstimateDto,
        nullable: true,
    })
    between: AiAnalyticsPhase4EstimateDto | null;

    @ApiProperty({
        description: 'β общая; null — нет оценки.',
        type: AiAnalyticsPhase4EstimateDto,
        nullable: true,
    })
    pooled: AiAnalyticsPhase4EstimateDto | null;

    @ApiProperty({
        description: 'Событий на параметр модели; null — не считалось.',
        example: 12.5,
        type: Number,
        nullable: true,
    })
    epv: number | null;

    @ApiProperty({
        description: 'Надёжность оценки качества r; null — не измерена.',
        example: 0.62,
        type: Number,
        nullable: true,
    })
    reliabilityR: number | null;

    @ApiProperty({
        description: 'Наклон калибровки с интервалом; null — не считался.',
        type: AiAnalyticsPhase4EstimateDto,
        nullable: true,
    })
    calibrationSlope: AiAnalyticsPhase4EstimateDto | null;

    @ApiProperty({
        description: 'Интервал наклона накрывает 1; null — наклона нет.',
        example: true,
        type: Boolean,
        nullable: true,
    })
    calibrationCoversOne: boolean | null;

    @ApiProperty({
        description: 'Плацебо по лиду пройдено; null — не считалось.',
        example: true,
        type: Boolean,
        nullable: true,
    })
    placeboPassed: boolean | null;

    @ApiProperty({
        description: 'Гейт пройден в этом пересчёте.',
        example: false,
        type: Boolean,
    })
    gatePassedNow: boolean;

    @ApiProperty({
        description: 'Пересчётов подряд с пройденным гейтом.',
        example: 1,
        type: Number,
    })
    gateStreak: number;

    @ApiProperty({
        description: 'Сколько пересчётов подряд нужно (beta_gate_months).',
        example: 2,
        type: Number,
    })
    gateMonths: number;

    @ApiProperty({
        description: 'β опубликована — режим «по данным».',
        example: false,
        type: Boolean,
    })
    published: boolean;

    @ApiProperty({
        description: 'Проверка утечки времени пройдена.',
        example: true,
        type: Boolean,
    })
    timestampLeakOk: boolean;
}

export class AiAnalyticsQualityLinkResultDto implements Phase4QualityLink {
    @ApiProperty({
        description: 'Домен портала запроса.',
        example: 'april.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description:
            'Последний отчёт о связи качества с исходом; null — ещё не считался.',
        type: AiAnalyticsQualityLinkDto,
        nullable: true,
    })
    latest: AiAnalyticsQualityLinkDto | null;
}
