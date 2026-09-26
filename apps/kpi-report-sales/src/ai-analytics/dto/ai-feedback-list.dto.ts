import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { AiAnalyticsFeedbackKind } from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_USER_FEEDBACK_KINDS } from '../constants/ai-feedback.const';
import { AiRequestBaseDto } from './ai-request-base.dto';
import { AiAnalyticsEnvelopeDto } from './ai-response-envelope.dto';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Список обратной связи по домену/периоду/менеджеру. */
export class AiFeedbackListRequestDto extends AiRequestBaseDto {
    @ApiProperty({
        description: 'Начало периода (YYYY-MM-DD, TZ портала), включительно.',
        type: String,
        example: '2026-09-01',
    })
    @IsString()
    @Matches(DATE_PATTERN, { message: 'from должен быть в формате YYYY-MM-DD' })
    from: string;

    @ApiProperty({
        description: 'Конец периода (YYYY-MM-DD, TZ портала), включительно.',
        type: String,
        example: '2026-09-30',
    })
    @IsString()
    @Matches(DATE_PATTERN, { message: 'to должен быть в формате YYYY-MM-DD' })
    to: string;

    @ApiPropertyOptional({
        description:
            'Bitrix-id менеджера. Для менеджера без роли руководителя ' +
            'подставляется его собственный id.',
        type: String,
        example: '512',
    })
    @IsOptional()
    @IsString()
    managerId?: string;
}

export class AiFeedbackItemDto {
    @ApiProperty({
        description: 'Id записи ais.',
        type: String,
        example: '3081',
    })
    id: string;

    @ApiProperty({
        description:
            'Вид реакции (только пользовательские: служебные виды доставки, ' +
            'алертов и меток руководителя в список не попадают).',
        enum: AI_ANALYTICS_USER_FEEDBACK_KINDS,
        example: 'disagree',
    })
    kind: AiAnalyticsFeedbackKind;

    @ApiProperty({
        description: 'Объект реакции.',
        type: String,
        example: 'call:10245',
    })
    object: string;

    @ApiProperty({
        description: 'Bitrix-id менеджера.',
        type: String,
        nullable: true,
        example: '512',
    })
    managerId: string | null;

    @ApiProperty({
        description: 'Id транскрипции.',
        type: String,
        nullable: true,
        example: '10245',
    })
    transcriptionId: string | null;

    @ApiProperty({
        description: 'Кто оставил реакцию; null — push-контур.',
        type: String,
        nullable: true,
        example: '447',
    })
    requesterUserId: string | null;

    @ApiProperty({
        description: 'Причина.',
        type: String,
        nullable: true,
        example: 'Оценка занижена: клиент сам перенёс встречу',
    })
    reason: string | null;

    @ApiProperty({
        description: 'Когда записано (ISO 8601).',
        type: String,
        example: '2026-09-03T10:15:00.000Z',
    })
    createdAt: string;
}

export class AiFeedbackListDto {
    @ApiProperty({
        description:
            'Пользовательские реакции за период. Без managerId — только ' +
            'менеджеры периметра руководителя; записи без менеджера видит ' +
            'только cup.',
        type: [AiFeedbackItemDto],
    })
    items: AiFeedbackItemDto[];

    @ApiProperty({
        description:
            'Доля несогласий, %: disagree среди реакций useful/not_useful/disagree; ' +
            'null — реакций нет.',
        type: Number,
        nullable: true,
        example: 12.5,
    })
    disagreementSharePct: number | null;
}

export class AiFeedbackListResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiPropertyOptional({
        description: 'Список (при status = ready).',
        type: AiFeedbackListDto,
    })
    data?: AiFeedbackListDto;
}
