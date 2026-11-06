import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import {
    CALL_REPORT_ISSUE_CODES,
    CALL_REPORT_OFFER_QUESTION_CODES,
    CALL_REPORT_PRICE_KINDS,
    CALL_REPORT_UPSELL_KINDS,
    type CallReportIssueCode,
    type CallReportOfferQuestionCode,
    type CallReportPriceKind,
    type CallReportUpsellKind,
} from '@lib/call-lib';

/**
 * Факты разбора для отчётов руководителю и собственнику (focus-v3.1,
 * 06.11.2026): сбои не по вине разговора, прозвучавшие цены, допродажа,
 * самопредставление. Исход разговора и вид шага — поля слоёв DTO выше.
 */

/** Сбой не по вине разговора: данные CRM, связь, демо-доступ, обещания. */
export class AgentIssueDto {
    @ApiProperty({
        description: 'Код сбоя по закрытому справочнику.',
        enum: CALL_REPORT_ISSUE_CODES,
        example: 'crm_duplicate',
    })
    @IsString()
    @IsIn(CALL_REPORT_ISSUE_CODES as unknown as string[])
    code: CallReportIssueCode;

    @ApiProperty({
        description: 'Дословная цитата из разговора, подтверждающая сбой.',
        example: 'Вы мне уже третий раз за неделю звоните',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    quote: string;

    @ApiPropertyOptional({
        description: 'Одна фраза, что именно произошло; null — без пояснения.',
        example: 'Клиенту звонили два менеджера в один день',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    note?: string | null;
}

/** Цена, прозвучавшая в разговоре. */
export class AgentPriceDto {
    @ApiProperty({
        description: 'Сумма в рублях.',
        example: 25500,
        type: Number,
        minimum: 0,
    })
    @IsNumber()
    @Min(0)
    amount: number;

    @ApiPropertyOptional({
        description:
            'За сколько месяцев названа цена (12 — год, 3 — квартал); ' +
            'null — срок не прозвучал.',
        example: 3,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    periodMonths?: number | null;

    @ApiPropertyOptional({
        description:
            'За что названа цена (комплект, доступ, продукт); null — не ясно.',
        example: 'Гарант Универсал',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    product?: string | null;

    @ApiProperty({
        description: 'Обычная цена (list) или по акции / со скидкой (promo).',
        enum: CALL_REPORT_PRICE_KINDS,
        example: 'promo',
    })
    @IsString()
    @IsIn(CALL_REPORT_PRICE_KINDS as unknown as string[])
    kind: CallReportPriceKind;

    @ApiPropertyOptional({
        description: 'Фраза, в которой цена прозвучала.',
        example: 'За три месяца выйдет двадцать пять пятьсот',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    quote?: string | null;
}

/** Допродажа: предлагал ли менеджер больше, чем просил клиент. */
export class AgentUpsellDto {
    @ApiProperty({
        description: 'Была ли попытка предложить больше.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    attempted: boolean;

    @ApiPropertyOptional({
        description:
            'Что предлагали сверх запроса: комплект, срок, доступы, другое; ' +
            'null — попытки не было.',
        enum: CALL_REPORT_UPSELL_KINDS,
        nullable: true,
        example: 'period',
    })
    @IsOptional()
    @IsString()
    @IsIn(CALL_REPORT_UPSELL_KINDS as unknown as string[])
    kind?: CallReportUpsellKind | null;

    @ApiPropertyOptional({
        description: 'Что именно предложили, словами; null — попытки не было.',
        example: 'Подписка на год вместо квартала со скидкой',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    what?: string | null;
}

/** Самопредставление менеджера в начале разговора. */
export class AgentSelfIntroDto {
    @ApiProperty({
        description: 'Назвал ли менеджер себя по имени.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    introduced: boolean;

    @ApiProperty({
        description: 'Назвал ли менеджер компанию или бренд.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    companyNamed: boolean;

    @ApiProperty({
        description:
            'Ответ на вопрос собеседника «вы что-то предлагаете?»: ' +
            'none — вопроса не было, honest — ответил прямо, ' +
            'evasive — ушёл от ответа.',
        enum: CALL_REPORT_OFFER_QUESTION_CODES,
        example: 'none',
    })
    @IsString()
    @IsIn(CALL_REPORT_OFFER_QUESTION_CODES as unknown as string[])
    offerQuestion: CallReportOfferQuestionCode;
}
