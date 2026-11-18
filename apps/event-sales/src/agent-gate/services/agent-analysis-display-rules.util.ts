import { Logger } from '@nestjs/common';
import { isScriptComplianceTrusted } from '@lib/call-lib';
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
    return applyScriptComplianceRule(transcriptionId, dto, logger);
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
