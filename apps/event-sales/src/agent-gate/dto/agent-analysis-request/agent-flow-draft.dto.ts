import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsIn,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';

/**
 * Черновик события в кодах event-sales flow — вынесен из общего файла
 * контракта агента (лимит файла); имена и декораторы прежние.
 */

/** Статусы результата события — коды event-sales flow (report.resultStatus). */
export const AGENT_FLOW_RESULT_STATUSES = [
    'result',
    'noresult',
    'expired',
] as const;

export type AgentFlowResultStatus = (typeof AGENT_FLOW_RESULT_STATUSES)[number];

/** Причины недозвона — коды event-sales flow (report.noresultReason). */
export const AGENT_FLOW_NORESULT_REASONS = [
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
] as const;

export type AgentFlowNoresultReason =
    (typeof AGENT_FLOW_NORESULT_REASONS)[number];

/** Типы планируемого события — коды event-sales flow (plan.type). */
export const AGENT_FLOW_PLAN_TYPES = [
    'cold',
    'warm',
    'presentation',
    'hot',
    'moneyAwait',
    'supply',
] as const;

export type AgentFlowPlanType = (typeof AGENT_FLOW_PLAN_TYPES)[number];

/** Черновик отчёта о звонке в кодах event-sales flow. */
export class AgentFlowReportDraftDto {
    @ApiProperty({
        description:
            'Статус результата звонка: result — контакт состоялся и есть результат, ' +
            'noresult — пообщаться не удалось, expired — контакт был, договорились перенести.',
        enum: AGENT_FLOW_RESULT_STATUSES,
        example: 'result',
    })
    @IsString()
    @IsIn(AGENT_FLOW_RESULT_STATUSES as unknown as string[])
    resultStatus: AgentFlowResultStatus;

    @ApiPropertyOptional({
        description:
            'Причина недозвона (только при resultStatus=noresult): secretar / nopickup / ' +
            'busy / auto и т.д. — коды справочника event-sales.',
        enum: AGENT_FLOW_NORESULT_REASONS,
        example: 'secretar',
    })
    @IsOptional()
    @IsString()
    @IsIn(AGENT_FLOW_NORESULT_REASONS as unknown as string[])
    noresultReasonCode?: AgentFlowNoresultReason;
}

/** Черновик плана следующего события в кодах event-sales flow. */
export class AgentFlowPlanDraftDto {
    @ApiProperty({
        description: 'Запланирован ли следующий контакт по итогам звонка.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    isPlanned: boolean;

    @ApiPropertyOptional({
        description:
            'Тип планируемого события (при isPlanned=true): warm — обычный повторный ' +
            'звонок, presentation — презентация, hot — клиент принимает решение и т.д.',
        enum: AGENT_FLOW_PLAN_TYPES,
        example: 'presentation',
    })
    @IsOptional()
    @IsString()
    @IsIn(AGENT_FLOW_PLAN_TYPES as unknown as string[])
    typeCode?: AgentFlowPlanType;

    @ApiPropertyOptional({
        description: 'Краткое название планируемого события.',
        example: 'Провести презентацию Гарант Универсал',
        type: String,
    })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({
        description: 'Дата следующего контакта в формате YYYY-MM-DD.',
        example: '2026-07-24',
        type: String,
    })
    @IsOptional()
    @IsString()
    deadlineDate?: string;
}

/**
 * Черновик события для будущей автоотправки в POST /event-sales/flow.
 * Сейчас НИКУДА не отправляется — копится в БД (ais.report_result) для
 * анализа качества; переходное состояние — отправка по утверждению менеджера.
 */
export class AgentFlowDraftDto {
    @ApiProperty({
        description: 'Черновик отчёта о звонке (report-часть flow).',
        type: AgentFlowReportDraftDto,
    })
    @ValidateNested()
    @Type(() => AgentFlowReportDraftDto)
    report: AgentFlowReportDraftDto;

    @ApiProperty({
        description: 'Черновик плана следующего события (plan-часть flow).',
        type: AgentFlowPlanDraftDto,
    })
    @ValidateNested()
    @Type(() => AgentFlowPlanDraftDto)
    plan: AgentFlowPlanDraftDto;
}
