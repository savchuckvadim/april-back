/**
 * Блок «качество × продвижение» обзора: lite-строки → матрица
 * (@lib/sales-ai-analytics buildQualityProgress) → DTO с русскими названиями
 * клеток и объяснением словами. Чистые функции; пороги — те же, что у
 * сигналов «Внимания» (слой портала).
 */
import {
    buildQualityProgress,
    QUALITY_PROGRESS_QUADRANTS,
    RU_FORMS,
    ruCount,
    type MatrixCallRow,
    type QualityProgressCell,
    type QualityProgressQuadrant,
    type QualityProgressThresholds,
} from '@lib/sales-ai-analytics';
import {
    AiQualityProgressCellDto,
    AiQualityProgressDto,
    AiQualityProgressQuadrantDto,
} from '../../dto/ai-quality-progress.dto';
import { ru1 } from './type-cell.presenter';

interface QuadrantText {
    title: string;
    /** Короткое имя для перечисления клеток в объяснении. */
    short: string;
    hint: string;
}

/** Тексты клеток по правилу владельца: по-русски, с «что сделать». */
export const QUALITY_PROGRESS_QUADRANT_TEXTS: Readonly<
    Record<QualityProgressQuadrant, QuadrantText>
> = {
    strong: {
        title: 'Качество есть, сделки движутся',
        short: 'качество и движение',
        hint: 'Разговор качественный и сделка продвинулась — так и должно быть; таких менеджеров ставьте в пример.',
    },
    quality_no_progress: {
        title: 'Качество есть, сделки стоят',
        short: 'качество без движения',
        hint: 'Разговор хороший, а сделка не двигается: причина, скорее, вне звонка — цена, продукт, не тот собеседник. Проверьте, с кем говорит менеджер и что предлагает.',
    },
    progress_no_quality: {
        title: 'Купил бы и без менеджера',
        short: 'купил бы и без менеджера',
        hint: 'Сделка продвинулась при слабом разговоре: клиент сам готов покупать, вклад менеджера мал. Прослушайте такие звонки — в них теряется допродажа и лояльность.',
    },
    weak: {
        title: 'Слабые звонки, сделки стоят',
        short: 'слабые',
        hint: 'Разговор слабый и сделка не двигается: разбирать с менеджером в первую очередь.',
    },
};

export const qualityProgressQuadrants = (): AiQualityProgressQuadrantDto[] =>
    QUALITY_PROGRESS_QUADRANTS.map(code => ({
        code,
        title: QUALITY_PROGRESS_QUADRANT_TEXTS[code].title,
        hint: QUALITY_PROGRESS_QUADRANT_TEXTS[code].hint,
    }));

/**
 * «Звонков с продвижением: 14; оценка 6,8 из 10, продвижение 4,1 из 5.
 * Качество и движение — 8, …» либо «мало данных: 5 звонков с продвижением».
 */
export function qualityProgressExplanation(cell: QualityProgressCell): string {
    if (cell.score.value === null || cell.dealProgress.value === null) {
        return `мало данных: ${ruCount(cell.n, RU_FORMS.calls)} с продвижением сделки`;
    }
    const counts = QUALITY_PROGRESS_QUADRANTS.map(
        code =>
            `${QUALITY_PROGRESS_QUADRANT_TEXTS[code].short} — ${cell.counts[code]}`,
    ).join(', ');
    const sentence = counts.charAt(0).toUpperCase() + counts.slice(1);
    return (
        `Звонков с продвижением: ${cell.n}; оценка ${ru1(cell.score.value)} из 10, ` +
        `продвижение ${ru1(cell.dealProgress.value)} из 5. ${sentence}.`
    );
}

export function toQualityProgressCell(
    cell: QualityProgressCell,
): AiQualityProgressCellDto {
    return {
        n: cell.n,
        score: cell.score,
        dealProgress: cell.dealProgress,
        counts: {
            strong: cell.counts.strong,
            qualityNoProgress: cell.counts.quality_no_progress,
            progressNoQuality: cell.counts.progress_no_quality,
            weak: cell.counts.weak,
        },
        position: cell.position,
        explanation: qualityProgressExplanation(cell),
    };
}

/** Блок обзора; null — ни одного звонка с оценкой и продвижением. */
export function buildQualityProgressDto(
    rows: readonly MatrixCallRow[],
    thresholds: QualityProgressThresholds,
): AiQualityProgressDto | null {
    const matrix = buildQualityProgress(rows, thresholds);
    if (matrix === null) return null;
    return {
        thresholds: {
            qualityScoreMin: matrix.thresholds.qualityScoreMin,
            progressMovingMin: matrix.thresholds.progressMovingMin,
        },
        quadrants: qualityProgressQuadrants(),
        managers: matrix.managers.map(manager => ({
            ...toQualityProgressCell(manager),
            managerId: manager.managerId,
            progressNoQualityCallIds: manager.progressNoQualityCallIds,
        })),
        totals: toQualityProgressCell(matrix.totals),
    };
}
