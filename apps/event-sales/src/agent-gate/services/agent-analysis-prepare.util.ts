import { Logger } from '@nestjs/common';
import { AgentCallAnalysisDto } from '../dto/agent-analysis-request.dto';
import {
    clampObjectionTimecodes,
    normalizeAgentAnalysis,
} from './agent-analysis-normalize.util';
import { clampRiskEvidenceTimecodes } from './agent-analysis-risk.util';

/**
 * Подготовка разбора к записи в ais — общий шаг штатного приёма
 * (AgentAnalysisIntakeService) и переразбора истории
 * (CallReportReanalyzeUseCase): нормализация (гигиена строк, метрики
 * кодом, консистентность, риск-флаги по доказательствам) и таймкоды цитат
 * (П6) в пределах длительности записи — возражения и доказательства
 * риск-флагов. Один порядок шагов для обоих путей, иначе переразбор дал бы
 * записи другой формы. Чистая функция.
 */
export function prepareAgentAnalysis(
    transcriptionId: string,
    agentName: string,
    dto: AgentCallAnalysisDto,
    durationSec: number | null,
    logger: Logger,
): AgentCallAnalysisDto {
    const normalized = normalizeAgentAnalysis(
        transcriptionId,
        agentName,
        dto,
        logger,
    );
    return clampRiskEvidenceTimecodes(
        transcriptionId,
        clampObjectionTimecodes(
            transcriptionId,
            normalized,
            durationSec,
            logger,
        ),
        durationSec,
        logger,
    );
}

/** Длительность записи в секундах из строки транскрипции; нет — null. */
export function durationSecOf(row: {
    durationSec: string | null;
}): number | null {
    return row.durationSec === null ? null : Number(row.durationSec);
}
