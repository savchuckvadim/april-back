/**
 * Ответ `GET admin/ai-analytics/call-reviews`: страница отзывов
 * руководителей о разборах звонков и сводка за период.
 */
import { ApiProperty } from '@nestjs/swagger';
import {
    AI_ANALYTICS_CALL_REVIEW_AUTHOR_ROLES,
    AI_ANALYTICS_CALL_REVIEW_ITEM_KINDS,
    type AiAnalyticsCallReviewAuthorRole,
    type AiAnalyticsCallReviewItemKind,
} from '../../../contracts/call-review.types';
import { CALL_REVIEWS_ADMIN_PAGE } from '../call-reviews-admin.const';
import type {
    CallReviewAdminItem,
    CallReviewAdminRow,
    CallReviewsAdminPage,
} from '../call-reviews-admin.types';
import { CallReviewsAdminSummaryDto } from './call-reviews-admin-summary.dto';

/** Замечание «не так» к пункту разбора. */
export class CallReviewAdminItemDto implements CallReviewAdminItem {
    @ApiProperty({
        description:
            'К чему замечание: section — раздел, objection — возражение, methodology — пункт методики, fact — факт, call_type — тип звонка.',
        type: String,
        enum: AI_ANALYTICS_CALL_REVIEW_ITEM_KINDS,
        example: 'objection',
    })
    kind: AiAnalyticsCallReviewItemKind;

    @ApiProperty({
        description: 'Вид замечания словами.',
        type: String,
        example: 'возражение',
    })
    kindTitle: string;

    @ApiProperty({
        description: 'Подпись пункта на момент отзыва.',
        type: String,
        example: '«Дорого»',
    })
    label: string;

    @ApiProperty({
        description: 'Что не так, словами руководителя (до 2000 знаков).',
        type: String,
        example: 'Менеджер не отработал возражение, а AI засчитал.',
    })
    comment: string;
}

/** Один отзыв руководителя о разборе звонка. */
export class CallReviewAdminRowDto implements CallReviewAdminRow {
    @ApiProperty({
        description: 'Id записи отзыва в таблице ais.',
        type: String,
        example: '815204',
    })
    id: string;

    @ApiProperty({
        description: 'Когда оставлен отзыв, ISO (UTC).',
        type: String,
        example: '2026-11-18T12:41:00.000Z',
    })
    createdAt: string;

    @ApiProperty({
        description: 'Номер расшифровки звонка.',
        type: String,
        example: '10245',
    })
    transcriptionId: string;

    @ApiProperty({
        description: 'Когда начался звонок, ISO (UTC); неизвестно — null.',
        type: String,
        nullable: true,
        example: '2026-11-18T09:12:00.000Z',
    })
    callStartedAt: string | null;

    @ApiProperty({
        description:
            'Публичная ссылка на страницу разбора звонка (без личного ключа руководителя); ссылки не выпускаются — null.',
        type: String,
        nullable: true,
        example: 'https://report.april-app.ru/call/10245.abc',
    })
    callUrl: string | null;

    @ApiProperty({
        description: 'Bitrix-id менеджера звонка; неизвестен — null.',
        type: String,
        nullable: true,
        example: '447',
    })
    managerId: string | null;

    @ApiProperty({
        description: 'Имя менеджера из строки расшифровки; не записано — null.',
        type: String,
        nullable: true,
        example: 'Иванова Мария',
    })
    managerName: string | null;

    @ApiProperty({
        description: 'Bitrix-id автора отзыва.',
        type: String,
        example: '12',
    })
    authorId: string;

    @ApiProperty({
        description: 'Имя автора на момент отзыва.',
        type: String,
        example: 'Петров Пётр',
    })
    authorName: string;

    @ApiProperty({
        description:
            'Роль автора: leader — руководитель по структуре, superuser — суперпользователь.',
        type: String,
        enum: AI_ANALYTICS_CALL_REVIEW_AUTHOR_ROLES,
        example: 'leader',
    })
    authorRole: AiAnalyticsCallReviewAuthorRole;

    @ApiProperty({
        description: 'Роль автора словами.',
        type: String,
        example: 'руководитель',
    })
    authorRoleTitle: string;

    @ApiProperty({
        description:
            'Оценка AI на момент отзыва, шкала до 10 (как на витрине); не было — null.',
        type: Number,
        nullable: true,
        example: 7.2,
    })
    aiScore: number | null;

    @ApiProperty({
        description: 'Оценка руководителя 1–10; не поставил — null.',
        type: Number,
        nullable: true,
        example: 5,
    })
    leaderScore: number | null;

    @ApiProperty({
        description: 'Согласен ли руководитель с оценкой AI.',
        type: Boolean,
        example: false,
    })
    agree: boolean;

    @ApiProperty({
        description: 'Замечания «не так» к пунктам разбора (до 30).',
        type: [CallReviewAdminItemDto],
    })
    items: CallReviewAdminItemDto[];

    @ApiProperty({
        description:
            'Общий комментарий руководителя целиком (до 20 000 знаков); обрезку для показа делает фронт.',
        type: String,
        example:
            'Звонок слабый: потребность не выявлена, следующий шаг не назначен.',
    })
    comment: string;
}

/** Страница отзывов и сводка периода. */
export class CallReviewsAdminPageDto implements CallReviewsAdminPage {
    @ApiProperty({
        description: 'Домен портала.',
        type: String,
        example: 'gsr.bitrix24.ru',
    })
    domain: string;

    @ApiProperty({
        description: 'Первый день периода YYYY-MM-DD (по Москве).',
        type: String,
        example: '2026-10-21',
    })
    from: string;

    @ApiProperty({
        description: 'Последний день периода YYYY-MM-DD (по Москве).',
        type: String,
        example: '2026-11-19',
    })
    to: string;

    @ApiProperty({
        description: 'Отзывы страницы, свежие первыми.',
        type: [CallReviewAdminRowDto],
    })
    items: CallReviewAdminRowDto[];

    @ApiProperty({
        description: 'Всего отзывов под фильтрами.',
        type: Number,
        example: 23,
    })
    total: number;

    @ApiProperty({ description: 'Номер страницы.', type: Number, example: 1 })
    page: number;

    @ApiProperty({
        description: 'Отзывов на странице.',
        type: Number,
        example: CALL_REVIEWS_ADMIN_PAGE.defaultPageSize,
    })
    pageSize: number;

    @ApiProperty({
        description:
            'Сводка за весь период — без учёта фильтров согласия и вида «не так»: числа, средние оценки, замечания по видам и топ-10 пунктов.',
        type: CallReviewsAdminSummaryDto,
    })
    summary: CallReviewsAdminSummaryDto;
}
