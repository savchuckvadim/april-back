import {
    evaluateAll,
    type MethodologyConditionContext,
    type MethodologyFacts,
    type MethodologyNorms,
} from './methodology-condition';
import {
    isConnectionLostFacts,
    ruleEndsCall,
    statusUnderConnectionLost,
} from './methodology-connection-lost';
import type {
    CheckpointResult,
    MethodologyPassRaw,
} from './methodology-result.types';
import {
    checkpointsForType,
    type CheckpointStatus,
    type Methodology,
    type MethodologyCheckpoint,
    type MethodologyCondition,
} from './methodology.types';

/**
 * Пункты методики по разбору: ответы модели и правила кода. Вынесено из
 * methodology-evaluate по лимиту файла. Чистые функции.
 */

/** Текст без пробелов по краям; пусто — null. */
export const cleanText = (value: string | null | undefined): string | null =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/** Правило применимо, когда все его факты, нормы и пункты известны. */
function ruleApplicable(
    rule: readonly MethodologyCondition[],
    context: MethodologyConditionContext,
): boolean {
    return rule.every(condition => {
        if (condition.checkpoint !== undefined) {
            return context.checkpoints?.[condition.checkpoint] !== undefined;
        }
        if (condition.field === undefined) return false;
        if (context.facts[condition.field] === undefined) return false;
        if (condition.op === 'above_norm' || condition.op === 'within_norm') {
            return typeof context.norms?.[condition.field] === 'number';
        }
        return true;
    });
}

function fromModel(
    checkpoint: MethodologyCheckpoint,
    pass: MethodologyPassRaw | null,
    connectionLost: boolean,
): CheckpointResult {
    const raw = pass?.checkpoints.find(item => item.code === checkpoint.code);
    return {
        code: checkpoint.code,
        title: checkpoint.title,
        // Пункт, который модель не вернула, не считаем ни выполненным, ни
        // пропущенным — менеджера нельзя штрафовать за сбой модели. Пропуск
        // пункта о завершении разговора при обрыве связи не засчитывается.
        status: statusUnderConnectionLost(
            raw?.status ?? 'not_applicable',
            checkpoint.ending === true,
            connectionLost,
        ),
        mandatory: checkpoint.mandatory,
        source: 'model',
        quote: cleanText(raw?.quote),
        startSec: raw?.startSec ?? null,
        endSec: raw?.endSec ?? null,
    };
}

function fromRule(
    checkpoint: MethodologyCheckpoint,
    rule: readonly MethodologyCondition[],
    context: MethodologyConditionContext,
): CheckpointResult {
    const evaluated: CheckpointStatus = ruleApplicable(rule, context)
        ? evaluateAll(rule, context)
            ? 'done'
            : 'missed'
        : 'not_applicable';
    // Правило про конец разговора при обрыве связи не может быть «не выполнено».
    const status = statusUnderConnectionLost(
        evaluated,
        ruleEndsCall(checkpoint),
        isConnectionLostFacts(context.facts),
    );
    return {
        code: checkpoint.code,
        title: checkpoint.title,
        status,
        mandatory: checkpoint.mandatory,
        source: 'rule',
        quote: null,
        startSec: null,
        endSec: null,
    };
}

/**
 * Пункты методики для типа звонка: сначала ответы модели, затем правила
 * кода (они могут ссылаться на статусы модельных пунктов).
 */
export function evaluateCheckpoints(
    methodology: Methodology,
    callType: string | null,
    pass: MethodologyPassRaw | null,
    facts: MethodologyFacts,
    norms: MethodologyNorms,
): CheckpointResult[] {
    const applicable = checkpointsForType(methodology, callType);
    const connectionLost = isConnectionLostFacts(facts);
    const results = applicable
        .filter(checkpoint => checkpoint.rule === undefined)
        .map(checkpoint => fromModel(checkpoint, pass, connectionLost));
    const statuses: Record<string, CheckpointStatus> = Object.fromEntries(
        results.map(result => [result.code, result.status]),
    );
    for (const checkpoint of applicable) {
        if (checkpoint.rule === undefined) continue;
        const result = fromRule(checkpoint, checkpoint.rule, {
            facts,
            norms,
            checkpoints: statuses,
        });
        statuses[result.code] = result.status;
        results.push(result);
    }
    return results;
}
