import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsDefined,
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import {
    CALL_REPORT_CALL_TYPE_CODES,
    type CallReportCallTypeCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { PBX_DEAL_SALES_BASE_STAGES } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import {
    AI_FUNNEL_EDGE_CODES,
    AI_HOT_CLIENT_COLORS,
    AI_INVOICE_NESTINGS,
    AI_NORM_STRATA,
} from '@lib/sales-ai-analytics/settings/ai-settings.types';

/** Коды стадий воронки «ОП Основная» — справочник для decisionStages. */
const SALES_STAGE_CODES = PBX_DEAL_SALES_BASE_STAGES.map(stage => stage.code);

/** Порог длительности разбираемого звонка для одного типа. */
export class AiMinDurationDto {
    @ApiProperty({
        description: 'Код типа звонка из справочника разбора.',
        enum: CALL_REPORT_CALL_TYPE_CODES,
        example: 'cold',
    })
    @IsIn(CALL_REPORT_CALL_TYPE_CODES)
    callType: CallReportCallTypeCode;

    @ApiProperty({
        description:
            'Порог длительности в секундах: короче — звонок в разбор не ' +
            'идёт. Тип звонка порог не назначает (решение владельца А.1).',
        type: Number,
        example: 300,
    })
    @IsNumber()
    seconds: number;
}

/** Определения событий портала: что считается чем при расчёте. */
export class AiDefinitionsDto {
    @ApiPropertyOptional({
        description: 'Что считать продуктивным звонком (kpi_done и т.п.).',
        type: String,
        example: 'kpi_done',
    })
    @IsOptional()
    @IsString()
    productiveCall?: string;

    @ApiPropertyOptional({
        description: 'Канон презентации (presentation_uniq_done и т.п.).',
        type: String,
        example: 'presentation_uniq_done',
    })
    @IsOptional()
    @IsString()
    presentationCanon?: string;

    @ApiPropertyOptional({
        description: 'Считать только подтверждённые презентации.',
        type: Boolean,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    confirmedOnly?: boolean;

    @ApiPropertyOptional({
        description:
            'Правило «горячего» клиента: stage_from:<код стадии> лестницы ' +
            'sales_base (решение владельца А.2 — от «В решении»).',
        type: String,
        example: 'stage_from:sales_in_progress',
    })
    @IsOptional()
    @IsString()
    hotClient?: string;

    @ApiPropertyOptional({
        description: 'Пороги длительности по типам звонков.',
        type: [AiMinDurationDto],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(CALL_REPORT_CALL_TYPE_CODES.length)
    @ValidateNested({ each: true })
    @Type(() => AiMinDurationDto)
    minDurationSecByType?: AiMinDurationDto[];

    @ApiPropertyOptional({
        description:
            'Вложенность счетов относительно КП: disjoint — счёт без КП ' +
            'считается отдельно, nested — счёт всегда после КП.',
        enum: AI_INVOICE_NESTINGS,
        example: 'disjoint',
    })
    @IsOptional()
    @IsIn(AI_INVOICE_NESTINGS)
    invoiceNesting?: string;

    @ApiPropertyOptional({
        description:
            'Считать ли первый звонок по заявке с сайта частью call_done.',
        type: Boolean,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    callDoneIncludesSiteComeCall?: boolean;

    @ApiPropertyOptional({
        description: 'Стадии «решения» — коды лестницы sales_base.',
        enum: SALES_STAGE_CODES,
        isArray: true,
        example: ['sales_offer_create', 'sales_in_progress'],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    decisionStages?: string[];

    @ApiPropertyOptional({
        description:
            'Рёбра воронки, которые считает модель: e1 звонок → презентация, ' +
            'e2 → КП, e3 → счёт, e3_prime звонок → счёт, e4 счёт → продажа, ' +
            'e5 презентация → продажа.',
        enum: AI_FUNNEL_EDGE_CODES,
        isArray: true,
        example: ['e1', 'e2', 'e4'],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    funnelEdges?: string[];

    @ApiPropertyOptional({
        description:
            'Слой нормы: tenure — по стажу (по умолчанию), level — по ' +
            'уровню, назначенному руководителем.',
        enum: AI_NORM_STRATA,
        example: 'tenure',
    })
    @IsOptional()
    @IsString()
    normStratum?: string;

    @ApiPropertyOptional({
        description: 'Цвета компании, попадающие в срез «горячих».',
        enum: AI_HOT_CLIENT_COLORS,
        isArray: true,
        example: ['green', 'yellow'],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    hotClientColors?: string[];
}

/** Одно переопределение гиперпараметра реестра. */
export class AiModelParamDto {
    @ApiProperty({
        description:
            'Код параметра реестра (forget_lambda, kappa_edge_early, ' +
            'norm_stratum и т.п.). Неизвестный код — 400.',
        type: String,
        example: 'forget_lambda',
    })
    @IsString()
    code: string;

    @ApiProperty({
        description:
            'Значение того же типа, что дефолт реестра, и в его диапазоне.',
        oneOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }],
        example: 0.85,
    })
    @IsDefined()
    value: number | string | boolean;
}
