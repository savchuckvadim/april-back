import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import {
    AI_ANALYTICS_CALL_REVIEW_AUTHOR_ROLES,
    AI_ANALYTICS_CALL_REVIEW_ITEM_KINDS,
    AI_ANALYTICS_CALL_REVIEW_LIMITS as LIMITS,
    type AiAnalyticsCallReviewAuthorRole,
    type AiAnalyticsCallReviewItem,
    type AiAnalyticsCallReviewItemKind,
} from '@lib/sales-ai-analytics';

/** Замечание «не так» к пункту разбора. */
export class CallReviewItemDto implements AiAnalyticsCallReviewItem {
    @ApiProperty({
        description:
            'К чему замечание: section — раздел разговора, objection — ' +
            'возражение, methodology — пункт методики, fact — факт разбора, ' +
            'call_type — тип звонка.',
        enum: AI_ANALYTICS_CALL_REVIEW_ITEM_KINDS,
        example: 'section',
    })
    @IsString()
    @IsIn(AI_ANALYTICS_CALL_REVIEW_ITEM_KINDS)
    kind: AiAnalyticsCallReviewItemKind;

    @ApiProperty({
        description:
            'Чей пункт: код раздела, id подсветки или код пункта методики — ' +
            'как на странице разбора.',
        type: String,
        maxLength: LIMITS.itemRef,
        example: 'NEEDS',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(LIMITS.itemRef)
    ref: string;

    @ApiProperty({
        description: 'Подпись пункта, как её видел руководитель (снимок).',
        type: String,
        maxLength: LIMITS.itemLabel,
        example: 'Выяснение потребностей',
    })
    @IsString()
    @MaxLength(LIMITS.itemLabel)
    label: string;

    @ApiProperty({
        description: 'Что не так в разборе этого пункта.',
        type: String,
        maxLength: LIMITS.itemComment,
        example: 'Потребность клиент назвал сам, менеджер её не выяснял',
    })
    @IsString()
    @MaxLength(LIMITS.itemComment)
    comment: string;
}

/** Отзыв руководителя о разборе — то, что он сохраняет. */
export class CallPageLeadReviewRequestDto {
    @ApiProperty({
        description: 'Согласен ли руководитель с оценкой AI.',
        type: Boolean,
        example: false,
    })
    @IsBoolean()
    agree: boolean;

    @ApiPropertyOptional({
        description: 'Своя оценка звонка 1–10; null или нет поля — не ставил.',
        type: Number,
        nullable: true,
        minimum: LIMITS.scoreMin,
        maximum: LIMITS.scoreMax,
        example: 5,
    })
    @IsOptional()
    @IsInt()
    @Min(LIMITS.scoreMin)
    @Max(LIMITS.scoreMax)
    leaderScore?: number | null;

    @ApiPropertyOptional({
        description: `Замечания «не так» к пунктам разбора — не больше ${LIMITS.items}.`,
        type: [CallReviewItemDto],
        maxItems: LIMITS.items,
    })
    @IsOptional()
    @Type(() => CallReviewItemDto)
    @IsArray()
    @ArrayMaxSize(LIMITS.items)
    @ValidateNested({ each: true })
    items?: CallReviewItemDto[];

    @ApiPropertyOptional({
        description: 'Общий комментарий — можно целым рассказом.',
        type: String,
        maxLength: LIMITS.comment,
        example: 'Оценка завышена: презентации не было, только знакомство.',
    })
    @IsOptional()
    @IsString()
    @MaxLength(LIMITS.comment)
    comment?: string;
}

/** Отзыв руководителя, как его видят на личной странице. */
export class CallPageLeadReviewDto {
    @ApiProperty({
        description: 'Имя автора отзыва (на момент отзыва).',
        type: String,
        example: 'Петров Пётр',
    })
    authorName: string;

    @ApiProperty({
        description:
            'Кто автор: leader — руководитель отдела, superuser — команда ' +
            'сервиса.',
        enum: AI_ANALYTICS_CALL_REVIEW_AUTHOR_ROLES,
        example: 'leader',
    })
    authorRole: AiAnalyticsCallReviewAuthorRole;

    @ApiProperty({
        description: 'Согласен ли автор с оценкой AI.',
        type: Boolean,
        example: true,
    })
    agree: boolean;

    @ApiProperty({
        description: 'Оценка автора 1–10; null — не ставил.',
        type: Number,
        nullable: true,
        example: 6,
    })
    leaderScore: number | null;

    @ApiProperty({
        description: 'Оценка AI на момент отзыва (до 10); null — не было.',
        type: Number,
        nullable: true,
        example: 6.4,
    })
    aiScore: number | null;

    @ApiProperty({
        description: 'Замечания «не так» к пунктам разбора.',
        type: [CallReviewItemDto],
    })
    items: CallReviewItemDto[];

    @ApiProperty({
        description: 'Общий комментарий; пусто — без комментария.',
        type: String,
        example: 'Согласен, но тип звонка — повторный, а не холодный.',
    })
    comment: string;

    @ApiProperty({
        description: 'Когда оставлен (ISO, UTC).',
        type: String,
        example: '2026-11-19T08:15:00.000Z',
    })
    createdAt: string;
}

/** Кто открыл личную страницу и что ему можно. */
export class CallPageLeadViewerDto {
    @ApiProperty({
        description: 'Имя руководителя; null — не прочиталось из портала.',
        type: String,
        nullable: true,
        example: 'Петров Пётр',
    })
    name: string | null;

    @ApiProperty({
        description:
            'Роль из ссылки: leader — руководитель, superuser — команда сервиса.',
        enum: AI_ANALYTICS_CALL_REVIEW_AUTHOR_ROLES,
        example: 'leader',
    })
    role: AiAnalyticsCallReviewAuthorRole;

    @ApiProperty({
        description:
            'Можно ли сейчас оставить отзыв: руководитель этого сотрудника ' +
            'или суперпользователь. Нет — отзывы не показываются.',
        type: Boolean,
        example: true,
    })
    canReview: boolean;

    @ApiProperty({
        description: 'До какого момента действует личная ссылка (ISO, UTC).',
        type: String,
        example: '2026-11-26T08:00:00.000Z',
    })
    expiresAt: string;
}

/** Личная страница руководителя: зритель, его отзыв и отзывы коллег. */
export class CallPageLeadViewDto {
    @ApiProperty({
        description: 'Кто открыл страницу.',
        type: CallPageLeadViewerDto,
    })
    viewer: CallPageLeadViewerDto;

    @ApiProperty({
        description: 'Мой актуальный отзыв; null — ещё не оставлял.',
        type: CallPageLeadReviewDto,
        nullable: true,
    })
    mine: CallPageLeadReviewDto | null;

    @ApiProperty({
        description:
            'Актуальные отзывы других руководителей по этому звонку, новые ' +
            'сверху.',
        type: [CallPageLeadReviewDto],
    })
    colleagues: CallPageLeadReviewDto[];
}
