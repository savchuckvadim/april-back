import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsIn,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import { CALL_BADGE_IDS, type CallBadgeId } from '@lib/sales-ai-analytics';
import { AiRequestBaseDto } from '../../dto/ai-request-base.dto';
import {
    CALLS_LIST_BADGES_MAX,
    CALLS_LIST_FILTER_MAX_ITEMS,
    CALLS_LIST_MAX_DAYS,
    CALLS_LIST_PAGE_LIMITS,
    CALLS_LIST_POINTS_MAX,
    CALLS_LIST_REVIEW_FILTERS,
    CALLS_LIST_SCORE_RANGE,
    CALLS_LIST_SORTS,
    type CallsListReviewFilter,
    type CallsListSort,
} from '../calls-list.const';
import { CallsListPointFilterDto } from './calls-list-badges.dto';
import { IsCallsListPeriod } from './calls-period.validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const USER_ID_PATTERN = /^\d{1,12}$/;

/**
 * Запрос раздела «Разборы звонков»: период, фильтры, порядок и страница.
 * Отбор, порядок и страница считаются на сервере; клиенту уходит только
 * страница и общее число строк.
 */
export class CallsListRequestDto extends AiRequestBaseDto {
    @ApiProperty({
        description:
            'Начало периода (YYYY-MM-DD, часовой пояс портала), включительно.',
        type: String,
        example: '2026-11-01',
    })
    @IsString()
    @Matches(DATE_PATTERN, { message: 'Начало периода — дата вида ГГГГ-ММ-ДД' })
    from: string;

    @ApiProperty({
        description:
            'Конец периода (YYYY-MM-DD, часовой пояс портала), включительно. ' +
            `Период — не длиннее ${CALLS_LIST_MAX_DAYS} дней, начало не позже конца.`,
        type: String,
        example: '2026-11-19',
    })
    @IsString()
    @Matches(DATE_PATTERN, { message: 'Конец периода — дата вида ГГГГ-ММ-ДД' })
    @IsCallsListPeriod()
    to: string;

    @ApiPropertyOptional({
        description:
            'Bitrix-id менеджеров (значения фасета managers). Пусто — все ' +
            'менеджеры, которых пользователь вправе видеть.',
        type: [String],
        example: ['447', '512'],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(CALLS_LIST_FILTER_MAX_ITEMS)
    @Matches(USER_ID_PATTERN, {
        each: true,
        message: 'Менеджер — числовой id сотрудника',
    })
    managerIds?: string[];

    @ApiPropertyOptional({
        description:
            'Коды типов звонка (значения фасета callTypes). Пусто — все типы.',
        type: [String],
        example: ['cold', 'presentation'],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(CALLS_LIST_FILTER_MAX_ITEMS)
    @IsString({ each: true })
    @MaxLength(64, { each: true })
    callTypes?: string[];

    @ApiPropertyOptional({
        description:
            'Оценка AI не ниже (шкала 1–10, как на витрине). Звонки без ' +
            'оценки при заданной границе не показываются.',
        type: Number,
        minimum: CALLS_LIST_SCORE_RANGE.min,
        maximum: CALLS_LIST_SCORE_RANGE.max,
        example: 3,
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(CALLS_LIST_SCORE_RANGE.min)
    @Max(CALLS_LIST_SCORE_RANGE.max)
    scoreMin?: number;

    @ApiPropertyOptional({
        description: 'Оценка AI не выше (шкала 1–10, как на витрине).',
        type: Number,
        minimum: CALLS_LIST_SCORE_RANGE.min,
        maximum: CALLS_LIST_SCORE_RANGE.max,
        example: 6.5,
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(CALLS_LIST_SCORE_RANGE.min)
    @Max(CALLS_LIST_SCORE_RANGE.max)
    scoreMax?: number;

    @ApiPropertyOptional({
        description:
            'Отзывы руководителей: any — все звонки, reviewed — с отзывом, ' +
            'not_reviewed — без отзыва, disagreed — хотя бы один ' +
            'руководитель не согласен с оценкой AI.',
        enum: CALLS_LIST_REVIEW_FILTERS,
        default: 'any',
        example: 'any',
    })
    @IsOptional()
    @IsString()
    @IsIn(CALLS_LIST_REVIEW_FILTERS)
    review?: CallsListReviewFilter;

    @ApiPropertyOptional({
        description:
            'Общие бейджи-фильтры (значения facets.badges[].id). Несколько ' +
            'бейджей сужают список: звонок должен нести их все; бейджи итога ' +
            'разговора (outcome_*) сочетаются между собой по «или». Пусто — ' +
            'без фильтра по бейджам.',
        type: String,
        enum: CALL_BADGE_IDS,
        isArray: true,
        example: ['step_missing', 'outcome_refused'],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(CALLS_LIST_BADGES_MAX)
    @IsString({ each: true })
    @IsIn(CALL_BADGE_IDS, { each: true })
    badges?: CallBadgeId[];

    @ApiPropertyOptional({
        description:
            'Бейджи пунктов методики портала (значения facets.points[]): код ' +
            'пункта и состояние — исполнен или не исполнен. Звонки, где пункт ' +
            'не проверялся или не относится к разговору, не попадают ни в одно ' +
            'из состояний. Несколько пунктов сужают список: звонок должен ' +
            'подходить под все. На один код — один бейдж, побеждает последний.',
        type: [CallsListPointFilterDto],
        example: [{ code: 'pres.spirals_min', state: 'missed' }],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(CALLS_LIST_POINTS_MAX)
    @ValidateNested({ each: true })
    @Type(() => CallsListPointFilterDto)
    points?: CallsListPointFilterDto[];

    @ApiPropertyOptional({
        description:
            'Порядок: date_desc — новые сверху (по умолчанию), date_asc — ' +
            'старые сверху, score_asc / score_desc — по оценке AI (звонки ' +
            'без оценки в конце).',
        enum: CALLS_LIST_SORTS,
        default: 'date_desc',
        example: 'date_desc',
    })
    @IsOptional()
    @IsString()
    @IsIn(CALLS_LIST_SORTS)
    sort?: CallsListSort;

    @ApiPropertyOptional({
        description: 'Номер страницы, с 1.',
        type: Number,
        minimum: 1,
        default: 1,
        example: 1,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @ApiPropertyOptional({
        description: `Строк на странице: по умолчанию ${CALLS_LIST_PAGE_LIMITS.defaultPageSize}, не больше ${CALLS_LIST_PAGE_LIMITS.maxPageSize}.`,
        type: Number,
        minimum: 1,
        maximum: CALLS_LIST_PAGE_LIMITS.maxPageSize,
        default: CALLS_LIST_PAGE_LIMITS.defaultPageSize,
        example: 25,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(CALLS_LIST_PAGE_LIMITS.maxPageSize)
    pageSize?: number;
}
