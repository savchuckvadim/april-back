/**
 * Сводка админ-списка «Отзывы о разборах» за период: числа, средние
 * оценки, замечания «не так» по видам и самые частые пункты.
 */
import { ApiProperty } from '@nestjs/swagger';
import {
    AI_ANALYTICS_CALL_REVIEW_ITEM_KINDS,
    type AiAnalyticsCallReviewItemKind,
} from '../../../contracts/call-review.types';
import type {
    CallReviewKindCount,
    CallReviewStats,
    CallReviewTopItem,
} from '../../../model/call-review/call-review.stats';

/** Замечания «не так» одного вида. */
export class CallReviewsAdminKindCountDto implements CallReviewKindCount {
    @ApiProperty({
        description:
            'Вид замечания: section — раздел, objection — возражение, methodology — пункт методики, fact — факт, call_type — тип звонка.',
        type: String,
        enum: AI_ANALYTICS_CALL_REVIEW_ITEM_KINDS,
        example: 'methodology',
    })
    kind: AiAnalyticsCallReviewItemKind;

    @ApiProperty({
        description: 'Вид словами — для показа людям.',
        type: String,
        example: 'пункт методики',
    })
    title: string;

    @ApiProperty({
        description: 'Сколько замечаний этого вида во всех отзывах периода.',
        type: Number,
        example: 7,
    })
    count: number;
}

/** Пункт «не так», который отмечали чаще других. */
export class CallReviewsAdminTopItemDto implements CallReviewTopItem {
    @ApiProperty({
        description: 'Вид замечания (код).',
        type: String,
        enum: AI_ANALYTICS_CALL_REVIEW_ITEM_KINDS,
        example: 'section',
    })
    kind: AiAnalyticsCallReviewItemKind;

    @ApiProperty({
        description: 'Вид словами.',
        type: String,
        example: 'раздел',
    })
    kindTitle: string;

    @ApiProperty({
        description:
            'Подпись пункта — как в первом отзыве с ним; одинаковые подписи без учёта регистра считаются одним пунктом.',
        type: String,
        example: 'Выявление потребности',
    })
    label: string;

    @ApiProperty({
        description: 'Сколько раз пункт отмечали «не так» за период.',
        type: Number,
        example: 4,
    })
    count: number;
}

/** Сводка отзывов за период (без фильтров согласия и вида «не так»). */
export class CallReviewsAdminSummaryDto implements CallReviewStats {
    @ApiProperty({
        description: 'Всего актуальных отзывов за период.',
        type: Number,
        example: 23,
    })
    total: number;

    @ApiProperty({
        description: 'Отзывов «не согласен с оценкой AI».',
        type: Number,
        example: 9,
    })
    disagree: number;

    @ApiProperty({
        description: 'Доля несогласных, % с одним знаком; отзывов нет — null.',
        type: Number,
        nullable: true,
        example: 39.1,
    })
    disagreePct: number | null;

    @ApiProperty({
        description:
            'Средняя оценка AI (шкала 1–10) по отзывам, где она была; нет — null.',
        type: Number,
        nullable: true,
        example: 6.4,
    })
    avgAiScore: number | null;

    @ApiProperty({
        description:
            'Средняя оценка руководителей (1–10) по отзывам, где её поставили; нет — null.',
        type: Number,
        nullable: true,
        example: 5.2,
    })
    avgLeaderScore: number | null;

    @ApiProperty({
        description:
            'Средняя разница «руководитель − AI» по отзывам с обеими оценками: минус — руководители строже модели; пар нет — null.',
        type: Number,
        nullable: true,
        example: -1.2,
    })
    avgScoreDiff: number | null;

    @ApiProperty({
        description:
            'Замечания «не так» по видам — все пять видов в постоянном порядке, включая нулевые.',
        type: [CallReviewsAdminKindCountDto],
    })
    itemKinds: CallReviewsAdminKindCountDto[];

    @ApiProperty({
        description: 'До 10 самых частых пунктов «не так», сначала частые.',
        type: [CallReviewsAdminTopItemDto],
    })
    topItems: CallReviewsAdminTopItemDto[];
}
