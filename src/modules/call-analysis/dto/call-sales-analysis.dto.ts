import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EventSalesFlowDto } from '@/apps/event-sales/dto/event-sale-flow/event-sales-flow.dto';

export type CallSentiment = 'positive' | 'neutral' | 'negative';

export const CALL_SENTIMENT_VALUES = [
    'positive',
    'neutral',
    'negative',
] as const satisfies readonly CallSentiment[];

export type CallOutcome =
    | 'заинтересован'
    | 'отказ'
    | 'перенос'
    | 'нет_ответа'
    | 'другое';

export const CALL_OUTCOME_VALUES = [
    'заинтересован',
    'отказ',
    'перенос',
    'нет_ответа',
    'другое',
] as const satisfies readonly CallOutcome[];

export type CallReportResultStatus = 'result' | 'noresult' | 'expired';

export const CALL_REPORT_RESULT_STATUS_VALUES = [
    'result',
    'noresult',
    'expired',
] as const satisfies readonly CallReportResultStatus[];

export type CallNoresultReasonCode =
    | 'secretar'
    | 'nopickup'
    | 'nonumber'
    | 'busy'
    | 'noresult_notime'
    | 'nocontact'
    | 'giveup'
    | 'bay'
    | 'wrong'
    | 'auto';

export const CALL_NORESULT_REASON_CODE_VALUES = [
    'secretar',
    'nopickup',
    'nonumber',
    'busy',
    'noresult_notime',
    'nocontact',
    'giveup',
    'bay',
    'wrong',
    'auto',
] as const satisfies readonly CallNoresultReasonCode[];

export type CallPlanTypeCode =
    | 'cold'
    | 'warm'
    | 'presentation'
    | 'hot'
    | 'moneyAwait'
    | 'supply';

export const CALL_PLAN_TYPE_CODE_VALUES = [
    'cold',
    'warm',
    'presentation',
    'hot',
    'moneyAwait',
    'supply',
] as const satisfies readonly CallPlanTypeCode[];

export class CallReportExtractDto {
    @ApiProperty({
        description:
            'Результирующий статус звонка для CRM-флоу: result — пообщались/договорились, noresult — не получилось пообщаться, expired — пообщались но переносим контакт.',
        type: String,
        enum: CALL_REPORT_RESULT_STATUS_VALUES,
        example: 'result',
    })
    @IsString()
    @IsIn(CALL_REPORT_RESULT_STATUS_VALUES as unknown as string[])
    resultStatus: CallReportResultStatus;

    @ApiProperty({
        description:
            'Код причины нерезультативности (когда resultStatus=noresult). null если разговор состоялся.',
        type: String,
        enum: CALL_NORESULT_REASON_CODE_VALUES,
        nullable: true,
        example: 'nopickup',
    })
    @IsOptional()
    @IsString()
    @IsIn(CALL_NORESULT_REASON_CODE_VALUES as unknown as string[])
    noresultReasonCode: CallNoresultReasonCode | null;
}

export class CallPlanExtractDto {
    @ApiProperty({
        description:
            'Запланирован ли следующий контакт по итогу звонка (true/false).',
        type: Boolean,
        example: true,
    })
    @IsBoolean()
    isPlanned: boolean;

    @ApiProperty({
        description:
            'Код типа планируемого события. null если ничего не планируется.',
        type: String,
        enum: CALL_PLAN_TYPE_CODE_VALUES,
        nullable: true,
        example: 'warm',
    })
    @IsOptional()
    @IsString()
    @IsIn(CALL_PLAN_TYPE_CODE_VALUES as unknown as string[])
    typeCode: CallPlanTypeCode | null;

    @ApiProperty({
        description: 'Краткое название планируемого события на русском языке.',
        type: String,
        example: 'Перезвонить уточнить решение',
    })
    @IsString()
    name: string;

    @ApiProperty({
        description:
            'Дата следующего контакта в формате YYYY-MM-DD. null если не названа в разговоре.',
        type: String,
        nullable: true,
        example: '2026-05-25',
    })
    @IsOptional()
    @IsString()
    deadlineDate: string | null;
}

export class CallFlowExtractDto {
    @ApiProperty({
        description: 'Извлечённые данные о прошедшем звонке (report).',
        type: CallReportExtractDto,
    })
    @ValidateNested()
    @Type(() => CallReportExtractDto)
    report: CallReportExtractDto;

    @ApiProperty({
        description:
            'Извлечённые данные о планируемом следующем контакте (plan).',
        type: CallPlanExtractDto,
    })
    @ValidateNested()
    @Type(() => CallPlanExtractDto)
    plan: CallPlanExtractDto;
}

export class CallSalesAnalysisResultDto {
    @ApiProperty({
        description: 'Краткое резюме разговора на русском языке.',
        type: String,
        example: 'Менеджер предложил демо-доступ, клиент согласился получить.',
    })
    @IsString()
    summary: string;

    @ApiProperty({
        description:
            'Был ли звонок результативным (состоялся диалог и принёс какой-то результат).',
        type: Boolean,
        example: true,
    })
    @IsBoolean()
    wasProductive: boolean;

    @ApiProperty({
        description: 'Итог звонка одной фразой на русском.',
        type: String,
        enum: CALL_OUTCOME_VALUES,
        example: 'заинтересован',
    })
    @IsString()
    @IsIn(CALL_OUTCOME_VALUES as unknown as string[])
    callOutcome: CallOutcome;

    @ApiProperty({
        description: 'Запланирован ли следующий контакт.',
        type: Boolean,
        example: true,
    })
    @IsBoolean()
    nextCallPlanned: boolean;

    @ApiProperty({
        description:
            'Предполагаемая дата следующего контакта YYYY-MM-DD или null.',
        type: String,
        nullable: true,
        example: '2026-05-25',
    })
    @IsOptional()
    @IsString()
    nextCallDate: string | null;

    @ApiProperty({
        description: 'Цель следующего контакта или null если не указана.',
        type: String,
        nullable: true,
        example: 'Уточнить решение по демо-доступу',
    })
    @IsOptional()
    @IsString()
    nextCallGoal: string | null;

    @ApiProperty({
        description: 'Эмоциональный тон клиента в разговоре.',
        type: String,
        enum: CALL_SENTIMENT_VALUES,
        example: 'positive',
    })
    @IsString()
    @IsIn(CALL_SENTIMENT_VALUES as unknown as string[])
    clientSentiment: CallSentiment;

    @ApiProperty({
        description: 'Выявленные потребности клиента.',
        type: [String],
        example: ['бесплатный демо-доступ', 'коммерческое предложение'],
    })
    @IsArray()
    @IsString({ each: true })
    clientNeeds: string[];

    @ApiProperty({
        description: 'Возражения, высказанные клиентом.',
        type: [String],
        example: ['дорого', 'нет времени'],
    })
    @IsArray()
    @IsString({ each: true })
    objections: string[];

    @ApiProperty({
        description: 'Ключевые моменты разговора.',
        type: [String],
        example: ['Клиент готов к демо', 'Решение примут на следующей неделе'],
    })
    @IsArray()
    @IsString({ each: true })
    keyPoints: string[];

    @ApiProperty({
        description:
            'Договорённости и обязательства, согласованные в разговоре.',
        type: [String],
        example: ['Отправить демо-доступ', 'Перезвонить в пятницу'],
    })
    @IsArray()
    @IsString({ each: true })
    agreedActions: string[];

    @ApiProperty({
        description:
            'Извлечённые данные для маппинга в EventSalesFlowDto (report + plan).',
        type: CallFlowExtractDto,
    })
    @ValidateNested()
    @Type(() => CallFlowExtractDto)
    flow: CallFlowExtractDto;
}

export class CallSalesAnalysisDto {
    @ApiProperty({
        description: 'ID активности-звонка в Bitrix24 (CRM activity).',
        type: Number,
        example: 893310,
    })
    @IsInt()
    @Min(1)
    activityId: number;

    @ApiProperty({
        description: 'ID сделки в Bitrix24, к которой привязан звонок.',
        type: Number,
        example: 34792,
    })
    @IsInt()
    @Min(1)
    dealId: number;

    @ApiProperty({
        description: 'Полная расшифровка аудиозаписи звонка (текст).',
        type: String,
        example: 'Алло, добрый день. Это Иван из компании April...',
    })
    @IsString()
    @IsNotEmpty()
    transcript: string;

    @ApiProperty({
        description:
            'Структурированный результат AI-анализа расшифровки (резюме + флоу).',
        type: CallSalesAnalysisResultDto,
    })
    @IsObject()
    @ValidateNested()
    @Type(() => CallSalesAnalysisResultDto)
    analysis: CallSalesAnalysisResultDto;

    @ApiPropertyOptional({
        description:
            'ID задачи Bitrix, созданной для подтверждения результата анализа менеджером.',
        type: Number,
        example: 136086,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    confirmationTaskId?: number;

    @ApiPropertyOptional({
        description:
            'Подготовленный EventSalesFlowDto (частично заполненный) для последующей отправки в /event-sales/flow после подтверждения менеджером. Не все поля заполнены: contact/sale/lead/departament/placement остаются undefined и заполняются на стороне фронта или event-sales.',
        type: EventSalesFlowDto,
    })
    @IsOptional()
    @IsObject()
    flowDto?: Partial<EventSalesFlowDto>;
}
