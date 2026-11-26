import { cleanText, evaluateCheckpoints } from './methodology-checkpoints';
import {
    evaluateAll,
    type MethodologyConditionContext,
    type MethodologyFacts,
} from './methodology-condition';
import {
    isCallEndCap,
    isConnectionLostFacts,
} from './methodology-connection-lost';
import type {
    CapTriggered,
    CheckpointResult,
    MethodologyAnalysisView,
    MethodologyEvaluation,
    MethodologyEvaluationInput,
    MethodologyOutcome,
    MethodologySectionView,
    SpiralResult,
} from './methodology-result.types';
import {
    capsForType,
    type CheckpointStatus,
    type Methodology,
    type MethodologyCap,
} from './methodology.types';

// Пункты методики считает methodology-checkpoints; имя осталось здесь.
export { evaluateCheckpoints };

/**
 * Вычисление методики по разбору КОДОМ: факты из разбора, пункты с
 * правилом, ограничители ядра и методики (срезают оценку раздела или итог
 * до потолка). Чистые функции; исходный срез не мутируется.
 */

/** Факты разбора для условий: неизвестное не кладём, пустое — null. */
export function buildMethodologyFacts(
    view: MethodologyAnalysisView,
    spirals: SpiralResult[] | null,
): MethodologyFacts {
    const facts: MethodologyFacts = {};
    if (view.needsFound !== undefined) facts.needsFound = view.needsFound;
    if (view.needs !== undefined) facts.needsCount = view.needs.length;
    if (view.presentationDone !== undefined) {
        facts.presentationDone = view.presentationDone;
    }
    if (view.priceDiscussed !== undefined) {
        facts.priceDiscussed = view.priceDiscussed;
    }
    if (view.productive !== undefined) facts.productive = view.productive;
    if (view.talkRatioPct !== undefined) facts.talkRatioPct = view.talkRatioPct;
    if (view.questionsCount !== undefined) {
        facts.questionsCount = view.questionsCount;
    }
    if (view.interlocutorRole !== undefined) {
        facts.interlocutorRole = cleanText(view.interlocutorRole);
    }
    if (view.specialist !== undefined)
        facts.specialist = cleanText(view.specialist);

    const step = view.nextStep;
    if (step !== undefined) {
        facts.nextStepSet = step?.set ?? false;
        facts.nextStepDate = cleanText(step?.date);
        facts.nextStepTime = cleanText(step?.time);
        facts.nextStepGoal = cleanText(step?.goal);
        facts.nextStepClientAction = cleanText(step?.clientAction);
        facts.nextStepManagerAction = cleanText(step?.managerAction);
        facts.nextStepComplete =
            facts.nextStepDate !== null &&
            facts.nextStepTime !== null &&
            facts.nextStepGoal !== null;
    }

    const hvost = view.hvostSteps;
    if (hvost !== undefined) {
        facts.hvostDesire = hvost?.desire ?? null;
        facts.hvostOffered = hvost?.offered ?? null;
        facts.hvostPriceReaction = hvost?.priceReaction ?? null;
        facts.hvostDecisionProcess = hvost?.decisionProcess ?? null;
        facts.hvostDecisionWay = hvost?.decisionWay ?? null;
    }

    if (spirals !== null) {
        facts.spiralsFull = spirals.filter(spiral => spiral.full).length;
        facts.spiralsWithoutNeed = spirals.filter(
            spiral => spiral.need === null,
        ).length;
        facts.spiralsWithoutQuestion = spirals.filter(
            spiral => spiral.question === null,
        ).length;
    }
    if (view.dealProgress !== undefined) {
        facts.dealProgressScore = view.dealProgress?.score ?? null;
    }
    if (view.connectionLost !== undefined) {
        facts.connectionLost = view.connectionLost;
    }
    return facts;
}

/**
 * Ограничители: условие выполнено — запись в список; оценка выше потолка —
 * срез (раздел с оценкой либо итог). Порядок срезов — порядок списка.
 */
export function applyCaps(
    view: Pick<MethodologyAnalysisView, 'callType' | 'sections' | 'score'>,
    caps: readonly MethodologyCap[],
    context: MethodologyConditionContext,
): {
    sections: MethodologySectionView[];
    score: number | undefined;
    triggered: CapTriggered[];
} {
    const sections = view.sections.map(section => ({ ...section }));
    let score = view.score;
    const triggered: CapTriggered[] = [];
    const connectionLost = isConnectionLostFacts(context.facts);
    for (const cap of capsForType(caps, view.callType)) {
        // Обрыв связи: ограничитель про конец разговора судил бы о том, до
        // чего разговор не дошёл, — он не срабатывает и в список не попадает.
        if (connectionLost && isCallEndCap(cap)) continue;
        if (!evaluateAll(cap.when, context)) continue;
        if (cap.target === 'total') {
            const before = score ?? null;
            const applied = before !== null && before > cap.max;
            if (applied) score = cap.max;
            triggered.push({
                code: cap.code,
                title: cap.title,
                target: cap.target,
                max: cap.max,
                before,
                after: before === null ? null : Math.min(before, cap.max),
                applied,
            });
            continue;
        }
        const section = sections.find(
            item =>
                item.section === cap.target &&
                item.relevance > 0 &&
                item.score !== undefined,
        );
        const before = section?.score ?? null;
        const applied = before !== null && before > cap.max;
        if (applied && section) section.score = cap.max;
        triggered.push({
            code: cap.code,
            title: cap.title,
            target: cap.target,
            max: cap.max,
            before,
            after: before === null ? null : Math.min(before, cap.max),
            applied,
        });
    }
    return { sections, score, triggered };
}

/** Методика применяется к звонку, если его тип в её списке. */
export const methodologyAppliesTo = (
    methodology: Methodology,
    callType: string | null,
): boolean =>
    callType !== null &&
    (methodology.types as readonly string[]).includes(callType);

/** Полный расчёт: факты → пункты → ограничители ядра и методики → итог. */
export function evaluateMethodology(
    input: MethodologyEvaluationInput,
): MethodologyEvaluation {
    const methodology =
        input.methodology !== null &&
        methodologyAppliesTo(input.methodology, input.view.callType)
            ? input.methodology
            : null;
    const spirals = methodology === null ? null : (input.pass?.spirals ?? null);
    const facts = buildMethodologyFacts(input.view, spirals);
    const checkpoints =
        methodology === null
            ? []
            : evaluateCheckpoints(
                  methodology,
                  input.view.callType,
                  input.pass,
                  facts,
                  input.norms,
              );
    const statuses: Record<string, CheckpointStatus> = Object.fromEntries(
        checkpoints.map(result => [result.code, result.status]),
    );
    const context: MethodologyConditionContext = {
        facts,
        norms: input.norms,
        checkpoints: statuses,
    };
    const capped = applyCaps(
        input.view,
        [...input.coreCaps, ...(methodology?.caps ?? [])],
        context,
    );
    return {
        sections: capped.sections,
        score: capped.score,
        capsTriggered: capped.triggered,
        methodology:
            methodology === null
                ? null
                : outcomeOf(methodology, checkpoints, spirals),
    };
}

function outcomeOf(
    methodology: Methodology,
    checkpoints: CheckpointResult[],
    spirals: SpiralResult[] | null,
): MethodologyOutcome {
    const mandatory = checkpoints.filter(
        result => result.mandatory && result.status !== 'not_applicable',
    );
    return {
        code: methodology.code,
        version: methodology.version,
        title: methodology.title,
        checkpoints,
        checkpointsDone: mandatory.filter(result => result.status === 'done')
            .length,
        checkpointsTotal: mandatory.length,
        spirals,
        spiralsFull:
            spirals === null
                ? null
                : spirals.filter(spiral => spiral.full).length,
        spiralsMinFull: spirals === null ? null : methodology.spirals.minFull,
    };
}
