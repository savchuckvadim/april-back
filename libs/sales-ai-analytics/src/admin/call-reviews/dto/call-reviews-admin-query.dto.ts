/**
 * Запрос админ-списка «Отзывы о разборах»: портал, период по Москве,
 * страница и фильтры (согласие с оценкой AI, вид замечания «не так»).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    Max,
    Min,
} from 'class-validator';
import {
    AI_ANALYTICS_CALL_REVIEW_ITEM_KINDS,
    type AiAnalyticsCallReviewItemKind,
} from '../../../contracts/call-review.types';
import { AI_ANALYTICS_KEY_PATTERNS } from '../../dto/ai-analytics-pipeline-admin.dto';
import {
    CALL_REVIEWS_ADMIN_PAGE,
    CALL_REVIEWS_AGREE_FILTERS,
    type CallReviewsAgreeFilter,
} from '../call-reviews-admin.const';

const trimLower = ({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CallReviewsAdminQueryDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24, чьи отзывы показать.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty({ message: 'domain обязателен' })
    @Transform(trimLower)
    domain: string;

    @ApiProperty({
        description:
            'Первый день периода YYYY-MM-DD по Москве, включительно: берутся отзывы, оставленные с начала этого дня.',
        example: '2026-10-21',
        type: String,
    })
    @IsString()
    @Matches(AI_ANALYTICS_KEY_PATTERNS.day, {
        message: 'from: ожидается YYYY-MM-DD',
    })
    from: string;

    @ApiProperty({
        description:
            'Последний день периода YYYY-MM-DD по Москве, включительно. Период — не длиннее 366 дней.',
        example: '2026-11-19',
        type: String,
    })
    @IsString()
    @Matches(AI_ANALYTICS_KEY_PATTERNS.day, {
        message: 'to: ожидается YYYY-MM-DD',
    })
    to: string;

    @ApiPropertyOptional({
        description: 'Номер страницы, начиная с 1.',
        type: Number,
        example: 1,
        minimum: 1,
        default: 1,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @ApiPropertyOptional({
        description: `Отзывов на странице (1–${CALL_REVIEWS_ADMIN_PAGE.maxPageSize}).`,
        type: Number,
        example: CALL_REVIEWS_ADMIN_PAGE.defaultPageSize,
        minimum: 1,
        maximum: CALL_REVIEWS_ADMIN_PAGE.maxPageSize,
        default: CALL_REVIEWS_ADMIN_PAGE.defaultPageSize,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(CALL_REVIEWS_ADMIN_PAGE.maxPageSize)
    pageSize?: number;

    @ApiPropertyOptional({
        description:
            'Согласие руководителя с оценкой AI: all — все отзывы, yes — только согласные, no — только несогласные.',
        type: String,
        enum: CALL_REVIEWS_AGREE_FILTERS,
        example: 'no',
        default: 'all',
    })
    @IsOptional()
    @IsString()
    @IsIn(CALL_REVIEWS_AGREE_FILTERS as unknown as string[])
    agree?: CallReviewsAgreeFilter;

    @ApiPropertyOptional({
        description:
            'Вид замечания «не так»: только отзывы, где есть хотя бы одно замечание этого вида (section — раздел, objection — возражение, methodology — пункт методики, fact — факт, call_type — тип звонка). Не задан — все отзывы.',
        type: String,
        enum: AI_ANALYTICS_CALL_REVIEW_ITEM_KINDS,
        example: 'methodology',
    })
    @IsOptional()
    @IsString()
    @IsIn(AI_ANALYTICS_CALL_REVIEW_ITEM_KINDS as unknown as string[])
    itemKind?: AiAnalyticsCallReviewItemKind;
}
