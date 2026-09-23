import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    ArrayMaxSize,
    IsArray,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    ValidateIf,
} from 'class-validator';
import {
    AI_REVIEW_AUTHOR_ROLES,
    AI_REVIEW_ISSUES,
    AI_REVIEW_LIMITS,
    AI_REVIEW_MESSAGES,
    AI_REVIEW_VERDICTS,
    AiReviewAuthorRole,
    AiReviewIssue,
    AiReviewVerdict,
} from '../constants/ai-review.const';
import { IsCommentRequiredUnlessAgreed } from '../review/review-comment.validator';
import { AI_REVIEW_LINK_PATTERN } from '../review/review-link.util';
import { AiAnalyticsEnvelopeDto } from './ai-response-envelope.dto';

/** Отзыв руководителя на разбор звонка с сайта продукта. */
export class AiReviewRequestDto {
    @ApiProperty({
        description:
            'Ссылка на карточку разбора звонка в смарт-процессе «AI-анализ ' +
            'звонков» портала: https://{портал}/crm/type/{тип}/details/{элемент}/. ' +
            'По ней определяются портал, смарт и элемент разбора.',
        type: String,
        example: 'https://april.bitrix24.ru/crm/type/1036/details/128/',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(AI_REVIEW_LIMITS.link)
    @Matches(AI_REVIEW_LINK_PATTERN, { message: AI_REVIEW_MESSAGES.badLink })
    link: string;

    @ApiProperty({
        description: 'Как обращаться к автору отзыва.',
        type: String,
        example: 'Иван Петров',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(AI_REVIEW_LIMITS.authorName)
    authorName: string;

    @ApiProperty({
        description:
            'Роль автора: rop — руководитель отдела продаж, group_head — ' +
            'руководитель группы, director — директор, other — другое.',
        enum: AI_REVIEW_AUTHOR_ROLES,
        example: 'rop',
    })
    @IsString()
    @IsIn(AI_REVIEW_AUTHOR_ROLES)
    authorRole: AiReviewAuthorRole;

    @ApiProperty({
        description:
            'Вердикт по разбору: agree — согласен, partly — согласен частично, ' +
            'disagree — не согласен.',
        enum: AI_REVIEW_VERDICTS,
        example: 'partly',
    })
    @IsString()
    @IsIn(AI_REVIEW_VERDICTS)
    verdict: AiReviewVerdict;

    @ApiProperty({
        description:
            'Что в разборе не так (коды): call_type — тип звонка, score — оценка, ' +
            'facts — факты/хвост/5К, recommendations — рекомендации, links — ' +
            'связь со сделкой/лидом, transcript — транскрипт, other — другое. ' +
            'Пусто — замечаний по пунктам нет.',
        enum: AI_REVIEW_ISSUES,
        isArray: true,
        example: ['score', 'recommendations'],
    })
    @IsArray()
    @IsString({ each: true })
    @ArrayMaxSize(AI_REVIEW_ISSUES.length)
    @IsIn(AI_REVIEW_ISSUES, { each: true })
    issues: AiReviewIssue[];

    @ApiPropertyOptional({
        description:
            'Что именно не так и как должно быть. Обязателен при вердикте ' +
            'partly и disagree.',
        type: String,
        example:
            'Это не презентация, а повторный звонок по счёту: оценка по рубрике презентации не применима.',
    })
    @ValidateIf(
        (dto: AiReviewRequestDto) =>
            dto.verdict !== 'agree' || dto.comment !== undefined,
    )
    @IsString()
    @IsCommentRequiredUnlessAgreed()
    @MaxLength(AI_REVIEW_LIMITS.comment)
    comment?: string;

    @ApiPropertyOptional({
        description:
            'Как связаться с автором, если нужно уточнить (почта, телефон, мессенджер).',
        type: String,
        example: 'ivan@company.ru',
    })
    @IsOptional()
    @IsString()
    @MaxLength(AI_REVIEW_LIMITS.contact)
    contact?: string;

    @ApiPropertyOptional({
        description:
            'Текст протокола анкеты сайта целиком — для сообщения в чат; в ' +
            'запись обратной связи не попадает.',
        type: String,
        example: 'ОТЗЫВ — разбор звонка (April)\n1. Ссылка: …',
    })
    @IsOptional()
    @IsString()
    @MaxLength(AI_REVIEW_LIMITS.protocol)
    protocol?: string;
}

/** Результат приёма отзыва. */
export class AiReviewResultDto {
    @ApiProperty({
        description: 'Id записи обратной связи в ais.',
        type: String,
        example: '90211',
    })
    id: string;

    @ApiProperty({
        description: 'Домен портала из ссылки.',
        type: String,
        example: 'april.bitrix24.ru',
    })
    domain: string;

    @ApiProperty({
        description: 'Id элемента разбора из ссылки.',
        type: Number,
        example: 128,
    })
    itemId: number;

    @ApiProperty({
        description:
            'Id транскрипции звонка, найденной по элементу; null — запись ' +
            'разбора по этому элементу в базе не найдена.',
        type: String,
        nullable: true,
        example: '10245',
    })
    transcriptionId: string | null;

    @ApiProperty({
        description:
            'Bitrix-id менеджера звонка по записи разбора; null — не найден.',
        type: String,
        nullable: true,
        example: '512',
    })
    managerId: string | null;

    @ApiProperty({
        description:
            'Запись разбора по элементу найдена: отзыв привязан к звонку, а не ' +
            'только к ссылке.',
        type: Boolean,
        example: true,
    })
    analysisFound: boolean;
}

export class AiReviewResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiPropertyOptional({
        description: 'Результат приёма отзыва (при status = ready).',
        type: AiReviewResultDto,
    })
    data?: AiReviewResultDto;
}
