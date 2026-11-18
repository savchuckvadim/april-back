import { Logger } from '@nestjs/common';
import type { TranscriptSegment } from '@lib/call-lib';
import { AgentCallAnalysisDto } from '../dto/agent-analysis-request.dto';
import { verifyAnalysisEvidence } from './agent-analysis-evidence.util';
import {
    clampObjectionTimecodes,
    normalizeAgentAnalysis,
} from './agent-analysis-normalize.util';
import { clampRiskEvidenceTimecodes } from './agent-analysis-risk.util';
import { dedupeSectionsWithLog } from './agent-analysis-sections.util';

/**
 * Подготовка разбора к записи в ais — общий шаг штатного приёма
 * (AgentAnalysisIntakeService) и переразбора истории
 * (CallReportReanalyzeUseCase): один раздел — одна запись (дубли кодов от
 * модели схлопываются), нормализация (гигиена строк, метрики кодом,
 * консистентность, риск-флаги по доказательствам) и таймкоды цитат (П6) в
 * пределах длительности записи — возражения и доказательства риск-флагов;
 * места разбора в разговоре (задание с цитатами focus-v3.4) — по репликам
 * расшифровки (segments; нет — только «внутри записи»). Один порядок шагов
 * для всех путей, иначе переразбор дал бы записи другой формы. Чистая
 * функция.
 */
export function prepareAgentAnalysis(
    transcriptionId: string,
    agentName: string,
    dto: AgentCallAnalysisDto,
    durationSec: number | null,
    logger: Logger,
    segments: readonly TranscriptSegment[] | null = null,
): AgentCallAnalysisDto {
    // Дубли разделов — до нормализации, чтобы метрики, поля смарта и
    // таймлайн считались по одному набору записей.
    const deduped: AgentCallAnalysisDto =
        dto.sections === undefined
            ? dto
            : {
                  ...dto,
                  sections: dedupeSectionsWithLog(
                      dto.sections,
                      `transcription ${transcriptionId}`,
                      logger,
                  ),
              };
    const normalized = normalizeAgentAnalysis(
        transcriptionId,
        agentName,
        deduped,
        logger,
    );
    const clamped = clampRiskEvidenceTimecodes(
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
    // После правил показа: у не-презентаций чек-листов уже нет — и мест их
    // пунктов тоже.
    return verifyAnalysisEvidence(
        transcriptionId,
        clamped,
        { durationSec, segments },
        logger,
    );
}

/** Длительность записи в секундах из строки транскрипции; нет — null. */
export function durationSecOf(row: {
    durationSec: string | null;
}): number | null {
    return row.durationSec === null ? null : Number(row.durationSec);
}
