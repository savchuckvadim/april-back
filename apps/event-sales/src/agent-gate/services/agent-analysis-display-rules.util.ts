import { Logger } from '@nestjs/common';
import {
    CALL_ANALYSIS_CHECKLIST_FIELDS,
    callTypeHasChecklists,
    isScriptComplianceTrusted,
    type CallAnalysisChecklistField,
} from '@lib/call-lib';
import { AgentCallAnalysisDto } from '../dto/agent-analysis-request.dto';

/**
 * Правила показа разбора при записи (решения владельца 18.11.2026) — шаг
 * общей подготовки разбора (prepareAgentAnalysis), через который идут
 * штатный приём, фокус-разбор, переразбор, догон и перезапись карточки.
 * Читающие места применяют те же правила из `@lib/call-lib`
 * (analysis-display), поэтому старые разборы тоже не показывают лишнего.
 * Чистые функции, исходный dto не мутируется.
 */

/** Все правила показа в одном порядке для всех путей записи. */
export function applyAnalysisDisplayRules(
    transcriptionId: string,
    dto: AgentCallAnalysisDto,
    logger: Logger,
): AgentCallAnalysisDto {
    return applyChecklistRule(
        transcriptionId,
        applyScriptComplianceRule(transcriptionId, dto, logger),
        logger,
    );
}

/** Все поля чек-листов — null. */
const CHECKLIST_NULLS = Object.fromEntries(
    CALL_ANALYSIS_CHECKLIST_FIELDS.map(field => [field, null]),
) as Readonly<Record<CallAnalysisChecklistField, null>>;

/**
 * Чек-листы «Хвост» и 5К — только у презентации (итоговый тип разбора
 * `callType`). У остальных типов, включая звонок по решению, все поля
 * чек-листов (CALL_ANALYSIS_CHECKLIST_FIELDS, с местами пунктов в
 * разговоре) обнуляются: в карточку (HVOST_* / FIVE_K_*), в ленту и на
 * страницу звонка они не идут.
 */
export function applyChecklistRule(
    transcriptionId: string,
    dto: AgentCallAnalysisDto,
    logger: Logger,
): AgentCallAnalysisDto {
    if (callTypeHasChecklists(dto.callType)) return dto;
    const dropped = CALL_ANALYSIS_CHECKLIST_FIELDS.filter(
        field => dto[field] !== undefined && dto[field] !== null,
    );
    if (dropped.length > 0) {
        logger.log(
            `Чек-листы «Хвост» и 5К сняты: тип звонка «${dto.callType}» — ` +
                `не презентация (${dropped.join(', ')}; transcription ${transcriptionId})`,
        );
    }
    return { ...dto, ...CHECKLIST_NULLS };
}

/**
 * «Соответствие скрипту» — только если в разбор попал документ вида
 * «Скрипт разговора» (признак `scriptIncluded` ставит сборка материалов).
 * Модель ставит процент и без скрипта — такой процент снимается кодом.
 * Признак записывается всегда (true/false), чтобы при чтении было видно,
 * можно ли верить проценту.
 */
export function applyScriptComplianceRule(
    transcriptionId: string,
    dto: AgentCallAnalysisDto,
    logger: Logger,
): AgentCallAnalysisDto {
    const scriptIncluded = isScriptComplianceTrusted(dto);
    if (!scriptIncluded && typeof dto.scriptCompliance === 'number') {
        logger.log(
            `Соответствие скрипту ${dto.scriptCompliance}% снято: скрипта ` +
                `разговора в разборе не было (transcription ${transcriptionId})`,
        );
    }
    return {
        ...dto,
        scriptIncluded,
        scriptCompliance: scriptIncluded
            ? (dto.scriptCompliance ?? null)
            : null,
    };
}
