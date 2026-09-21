import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsIn,
    IsInt,
    IsObject,
    IsOptional,
    IsString,
    Max,
    Min,
    ValidateNested,
} from 'class-validator';
import {
    CALL_REPORT_COACHING_CODES,
    CallReportCoachingCode,
} from '@lib/call-lib';
import { AgentAnalysisVersionsDto } from './agent-analysis-versions.dto';
import { AgentCallAnalysisContentDto } from './agent-call-analysis-content.dto';
import { AgentFlowDraftDto } from './agent-flow-draft.dto';
import {
    AgentListItemLinkDto,
    AgentRelatedDealsDto,
} from './agent-related-links.dto';

/**
 * Итоговый слой AgentCallAnalysisDto (оценка, связи, версии, flow) — класс
 * разрезан наследованием по лимиту файла, набор полей прежний.
 */

/**
 * Результат глубокого анализа звонка внешним агентом (OpenClaw/claude-code).
 * Принимается в POST /agent/calls/:transcriptionId/analysis; на его основе
 * создаётся элемент смарт-процесса «AI-анализ звонков».
 *
 * Поля классификации и содержания разбора — в базовых слоях
 * (AgentCallAnalysisClassificationDto → AgentCallAnalysisContentDto).
 */
export class AgentCallAnalysisDto extends AgentCallAnalysisContentDto {
    @ApiPropertyOptional({
        description:
            'Итоговая оценка качества работы менеджера в звонке (1–10), в контексте ' +
            'этапа продаж: учитываются только актуальные для типа звонка разделы.',
        example: 7,
        type: Number,
        minimum: 1,
        maximum: 10,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(10)
    score?: number;

    @ApiPropertyOptional({
        description:
            'Взвешенная оценка 0-100: Σ(score×relevance)/Σrelevance × 10 по разделам ' +
            'с relevance>0 — агрегируемая метрика для трендов (не штрафует за ' +
            'неактуальные разделы).',
        example: 62,
        type: Number,
        minimum: 0,
        maximum: 100,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100)
    weightedScore?: number;

    @ApiPropertyOptional({
        description:
            'Соответствие скрипту типа звонка, % (по материалам базы знаний).',
        example: 70,
        type: Number,
        minimum: 0,
        maximum: 100,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100)
    scriptCompliance?: number;

    @ApiPropertyOptional({
        description:
            'Приоритет разбора звонка руководителем: urgent (риск-флаги/провал) / ' +
            'planned / none — формирует coaching-очередь РОПа.',
        enum: CALL_REPORT_COACHING_CODES,
        example: 'planned',
    })
    @IsOptional()
    @IsString()
    @IsIn(CALL_REPORT_COACHING_CODES as unknown as string[])
    coachingPriority?: CallReportCoachingCode;

    @ApiPropertyOptional({
        description:
            'Объяснение итоговой оценки: из чего сложилась, что перевесило.',
        example:
            'Хороший контакт и потребности (8), но презентация без выгод (4) и нет следующего шага...',
        type: String,
    })
    @IsOptional()
    @IsString()
    scoreExplanation?: string;

    @ApiPropertyOptional({
        description:
            'Рекомендации сотруднику (накопительные, для развития): что и как ' +
            'потренировать, на что обращать внимание в следующих звонках.',
        example:
            'Потренировать связку свойство-выгода на 3 продуктах; записать себе 5 вопросов для выявления потребностей.',
        type: String,
    })
    @IsOptional()
    @IsString()
    employeeRecommendations?: string;

    @ApiPropertyOptional({
        description:
            'Привязка к сделкам воронок компании (кандидаты приходят в пакете звонка).',
        type: AgentRelatedDealsDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AgentRelatedDealsDto)
    relatedDeals?: AgentRelatedDealsDto;

    @ApiPropertyOptional({
        description:
            'Привязка к элементу списка ОП KPI (если удалось установить по содержанию).',
        type: AgentListItemLinkDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AgentListItemLinkDto)
    kpiItem?: AgentListItemLinkDto;

    @ApiPropertyOptional({
        description:
            'Привязка к элементу списка ОП История (если удалось установить по содержанию).',
        type: AgentListItemLinkDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AgentListItemLinkDto)
    historyItem?: AgentListItemLinkDto;

    @ApiPropertyOptional({
        description:
            'ID прочих связанных по смыслу записей отчётов менеджера из списка ' +
            'sales_history (кандидаты приходят в пакете звонка).',
        example: ['10231', '10234'],
        type: [String],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    relatedReportIds?: string[];

    @ApiPropertyOptional({
        description:
            'Версия скилла агента, которым сделан анализ (для отслеживания ' +
            'самообучения скилла).',
        example: 'call-analyst-v3',
        type: String,
    })
    @IsOptional()
    @IsString()
    agentVersion?: string;

    @ApiPropertyOptional({
        description:
            'Версии разбора (промпт, рубрика, реестр типов, атрибуция, ' +
            'классификатор) — сравнимость истории оценок между разборами.',
        type: AgentAnalysisVersionsDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AgentAnalysisVersionsDto)
    versions?: AgentAnalysisVersionsDto;

    @ApiPropertyOptional({
        description:
            'Черновик события в кодах event-sales flow (report + plan) — «как агент ' +
            'заполнил бы отчёт менеджера». Сохраняется в ais.report_result для будущей ' +
            'автоотправки в /event-sales/flow; сейчас в endpoint НЕ отправляется.',
        type: AgentFlowDraftDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AgentFlowDraftDto)
    flow?: AgentFlowDraftDto;

    @ApiPropertyOptional({
        description:
            'Произвольные дополнительные данные анализа (сохраняются в ais.user_result как есть).',
        example: { scriptCompliance: 80 },
        type: Object,
    })
    @IsOptional()
    @IsObject()
    extra?: Record<string, unknown>;
}
