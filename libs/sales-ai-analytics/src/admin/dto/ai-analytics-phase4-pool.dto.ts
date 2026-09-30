/**
 * Ответ админ-ручки `GET admin/ai-analytics/pool-status` (Фаза 4, поток
 * B3) и общая оценка с интервалом. Участники пула — только обезличенными
 * ключами и числом, доменов в ответе нет. Связь качества с исходом — в
 * `ai-analytics-phase4-quality.dto.ts` (лимит 300 строк).
 */
import { ApiProperty } from '@nestjs/swagger';
import { AI_POOL_STATUSES, type PoolStatus } from '../../model/pool.types';
import type {
    Phase4Estimate,
    Phase4PoolBeta,
    Phase4PoolPortal,
    Phase4PoolSnapshotView,
    Phase4PoolStatus,
} from '../services/ai-analytics-phase4.types';

/** Оценка с интервалом 90 %. */
export class AiAnalyticsPhase4EstimateDto implements Phase4Estimate {
    @ApiProperty({ description: 'Оценка.', example: 0.21, type: Number })
    value: number;

    @ApiProperty({
        description: 'Интервал 90 %: [нижняя, верхняя].',
        example: [0.08, 0.34],
        type: [Number],
    })
    ci90: number[];
}

/** Вердикт по порталу пула — обезличенно. */
export class AiAnalyticsPoolPortalDto implements Phase4PoolPortal {
    @ApiProperty({
        description: 'Обезличенный ключ портала (хэш), не домен.',
        example: '3f9a1c0b7d2e4a51',
        type: String,
    })
    key: string;

    @ApiProperty({
        description: 'Портал вошёл в пул в этом месяце.',
        example: true,
        type: Boolean,
    })
    included: boolean;

    @ApiProperty({
        description:
            'Код причины: included, no-consent, consent-not-yet, ' +
            'short-history.',
        example: 'included',
        type: String,
    })
    reason: string;
}

/** β пула с неоднородностью порталов. */
export class AiAnalyticsPoolBetaDto
    extends AiAnalyticsPhase4EstimateDto
    implements Phase4PoolBeta
{
    @ApiProperty({
        description: 'Неоднородность порталов I² (0–1).',
        example: 0.35,
        type: Number,
    })
    iSquared: number;

    @ApiProperty({
        description: 'Порталов в оценке β.',
        example: 4,
        type: Number,
    })
    portals: number;

    @ApiProperty({
        description: 'Метка оценки: estimated или hybrid (с прайором).',
        example: 'hybrid',
        type: String,
    })
    label: string;
}

export class AiAnalyticsPoolSnapshotDto implements Phase4PoolSnapshotView {
    @ApiProperty({
        description: 'Месяц сборки пула (YYYY-MM).',
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
        description: 'Статус пула: estimated — гейт по числу порталов пройден.',
        enum: AI_POOL_STATUSES,
        example: 'insufficient',
    })
    status: PoolStatus;

    @ApiProperty({
        description: 'Коды причин пропусков пула.',
        example: ['too-few-portals'],
        type: [String],
    })
    reasons: string[];

    @ApiProperty({
        description: 'Порталов с согласием и историей.',
        example: 2,
        type: Number,
    })
    eligible: number;

    @ApiProperty({
        description: 'Порталов, вошедших в пул.',
        example: 2,
        type: Number,
    })
    participants: number;

    @ApiProperty({
        description: 'Вердикты по порталам — обезличенно.',
        type: [AiAnalyticsPoolPortalDto],
    })
    portals: AiAnalyticsPoolPortalDto[];

    @ApiProperty({
        description: 'Обезличенный ключ этого портала.',
        example: '3f9a1c0b7d2e4a51',
        type: String,
    })
    selfKey: string;

    @ApiProperty({
        description: 'Этот портал вошёл в пул; null — себя в вердиктах нет.',
        example: true,
        type: Boolean,
        nullable: true,
    })
    selfIncluded: boolean | null;

    @ApiProperty({
        description: 'Рёбер воронки с нормой пула.',
        example: 4,
        type: Number,
    })
    edges: number;

    @ApiProperty({
        description: 'β пула; null — порталов с β мало.',
        type: AiAnalyticsPoolBetaDto,
        nullable: true,
    })
    beta: AiAnalyticsPoolBetaDto | null;

    @ApiProperty({
        description: 'Порталов с оценкой β среди вошедших.',
        example: 1,
        type: Number,
    })
    betaPortals: number;

    @ApiProperty({
        description:
            'Минимум порталов с β для уровня E2 (pool_min_portals_beta).',
        example: 3,
        type: Number,
    })
    minPortalsE2: number;

    @ApiProperty({
        description: 'Пул готов к уровню доказательности E2.',
        example: false,
        type: Boolean,
    })
    evidenceReady: boolean;
}

export class AiAnalyticsPoolStatusResultDto implements Phase4PoolStatus {
    @ApiProperty({
        description: 'Домен портала запроса.',
        example: 'april.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description:
            'Последний снапшот пула; null — пул ещё не собирался или портал без согласия.',
        type: AiAnalyticsPoolSnapshotDto,
        nullable: true,
    })
    latest: AiAnalyticsPoolSnapshotDto | null;
}
