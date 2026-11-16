/**
 * Проверка черновика методики на звонке: расчёт итога поверх готового
 * разбора (этап 6.6). Чистые функции: без DI, Bitrix и модели.
 */
import type {
    MethodologyPreviewResult,
    ResolvedMethodology,
} from '@lib/call-lib/call-report/methodology';
import type { AgentCallAnalysisDto } from '../../agent-gate/dto/agent-analysis-request.dto';
import type { CallMethodologyPassOutcome } from '../services/call-focus-analysis.service';
import { applyMethodologyToDto } from '../services/call-focus-methodology.util';

/** Отказ проверки с понятной причиной — текст уходит в админку как есть. */
export class MethodologyPreviewError extends Error {}

/** Цель ограничителя «итоговая оценка». */
const TOTAL_TARGET = 'total';

/**
 * Возвращает разбору оценки до ограничителей. Ограничители применяются по
 * очереди, поэтому исходную оценку цели хранит ПЕРВЫЙ сработавший на ней
 * ограничитель. Без этого черновик считался бы от уже срезанных оценок.
 */
export function restoreUncappedScores(dto: AgentCallAnalysisDto): void {
    const restored = new Set<string>();
    for (const cap of dto.capsTriggered ?? []) {
        if (!cap.applied || cap.before === null || restored.has(cap.target)) {
            continue;
        }
        restored.add(cap.target);
        if (cap.target === TOTAL_TARGET) {
            dto.score = cap.before;
            continue;
        }
        const section = (dto.sections ?? []).find(
            item => item.section === cap.target,
        );
        if (section) section.score = cap.before;
    }
}

/**
 * Итог проверки: пункты и спирали по черновику, ограничители, которые
 * сработали бы, и итоговая оценка «сейчас → с черновиком». Копия разбора
 * меняется на месте — оригинал вызывающий не передаёт.
 * @param analysis копия действующего разбора звонка
 * @param outcome ответ прохода методики; null — у методики нет прохода для типа
 */
export function buildMethodologyPreviewResult(
    analysis: AgentCallAnalysisDto,
    callType: string | null,
    resolved: ResolvedMethodology,
    outcome: CallMethodologyPassOutcome | null,
): MethodologyPreviewResult {
    const scoreBefore = analysis.score ?? null;
    if (outcome === null) {
        return {
            callType,
            applicable: false,
            methodology: null,
            capsTriggered: [],
            scoreBefore,
            scoreAfter: scoreBefore,
            model: null,
            tokens: null,
        };
    }
    restoreUncappedScores(analysis);
    // Пункты считаются по типу, с которым шёл проход (приор классификатора).
    if (callType !== null) analysis.callType = callType;
    applyMethodologyToDto(
        analysis,
        resolved,
        outcome.result,
        outcome.talkRatioMax,
    );
    return {
        callType,
        applicable: true,
        methodology: analysis.methodology ?? null,
        capsTriggered: analysis.capsTriggered ?? [],
        scoreBefore,
        scoreAfter: analysis.score ?? null,
        model: outcome.model,
        tokens: outcome.tokens,
    };
}
