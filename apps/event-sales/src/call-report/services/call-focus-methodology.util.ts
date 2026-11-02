import {
    CORE_CAPS,
    evaluateMethodology,
    type MethodologyAnalysisView,
    type MethodologyOutcome,
    type ResolvedMethodology,
} from '@lib/call-lib/call-report/methodology';
import { AgentCallAnalysisDto } from '../../agent-gate/dto/agent-analysis-request.dto';
import {
    buildMethodologyPassPrompt,
    buildMethodologyPassSchema,
    modelCheckpointsFor,
    parseMethodologyPass,
} from '../contracts/methodology-pass.contract';

/**
 * Шаг «методика» фокус-разбора (этап 1 плана методики Полянского), вынесен
 * из CallFocusAnalysisService по лимиту файла: сборка четвёртого прохода по
 * конфигу методики портала и применение ограничителей ядра и методики к
 * собранному разбору. Чистые функции над dto.
 */

/** Проход «методика» в терминах фокус-проходов сервиса. */
export interface MethodologyPassSpec {
    key: 'methodology';
    label: string;
    prompt: string;
    schema: Record<string, unknown>;
}

/** Проход по пунктам типа звонка; методики нет или спрашивать нечего — null. */
export function buildMethodologyPass(
    resolved: ResolvedMethodology | null,
    callType: string | null,
): MethodologyPassSpec | null {
    if (resolved === null) return null;
    const schema = buildMethodologyPassSchema(resolved.methodology, callType);
    if (schema === null) return null;
    return {
        key: 'methodology',
        label: `методика «${resolved.methodology.title}»`,
        prompt: buildMethodologyPassPrompt(resolved.methodology, callType),
        schema,
    };
}

/** Срез разбора для фактов методики — только нужные поля. */
export function toMethodologyView(
    dto: AgentCallAnalysisDto,
): MethodologyAnalysisView {
    const step = dto.nextStep;
    return {
        callType: dto.callType ?? null,
        sections: (dto.sections ?? []).map(section => ({
            section: section.section,
            relevance: section.relevance,
            score: section.score,
        })),
        score: dto.score,
        needsFound: dto.needsFound,
        needs: dto.needs,
        presentationDone: dto.presentationDone,
        priceDiscussed: dto.priceDiscussed,
        productive: dto.productive,
        nextStep: step
            ? {
                  set: step.set,
                  date: step.date ?? null,
                  time: step.time ?? null,
                  goal: step.goal ?? null,
                  clientAction: step.clientAction ?? null,
                  managerAction: step.managerAction ?? null,
              }
            : step,
        talkRatioPct: dto.talkRatioPct,
        questionsCount: dto.questionsCount,
        interlocutorRole: dto.interlocutorRole,
        specialist: dto.specialist,
        hvostSteps: dto.hvostSteps,
        dealProgress: dto.dealProgress,
    };
}

export interface MethodologyApplySummary {
    capsTriggered: number;
    capsApplied: number;
    methodology: MethodologyOutcome | null;
}

/**
 * Ограничители ядра (всегда) и методика портала поверх собранного dto:
 * оценки разделов и итог срезаются до потолков, список сработавших
 * ограничителей и итог методики пишутся в dto. Исходные (несрезанные)
 * оценки остаются в `capsTriggered[].before`.
 */
export function applyMethodologyToDto(
    dto: AgentCallAnalysisDto,
    resolved: ResolvedMethodology | null,
    passResult: unknown,
    talkRatioMax: number | null,
): MethodologyApplySummary {
    const methodology = resolved?.methodology ?? null;
    const pass =
        methodology === null
            ? null
            : parseMethodologyPass(
                  passResult,
                  modelCheckpointsFor(methodology, dto.callType ?? null).map(
                      checkpoint => checkpoint.code,
                  ),
              );
    const evaluation = evaluateMethodology({
        view: toMethodologyView(dto),
        methodology,
        pass,
        coreCaps: CORE_CAPS,
        norms: { talkRatioPct: talkRatioMax },
    });
    for (const section of dto.sections ?? []) {
        const capped = evaluation.sections.find(
            item => item.section === section.section,
        );
        if (capped !== undefined && capped.score !== section.score) {
            section.score = capped.score;
        }
    }
    if (evaluation.score !== undefined) dto.score = evaluation.score;
    dto.capsTriggered = evaluation.capsTriggered;
    dto.methodology = evaluation.methodology;
    return {
        capsTriggered: evaluation.capsTriggered.length,
        capsApplied: evaluation.capsTriggered.filter(cap => cap.applied).length,
        methodology: evaluation.methodology,
    };
}
