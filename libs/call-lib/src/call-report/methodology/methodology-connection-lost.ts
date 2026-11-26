import { CALL_REPORT_CONNECTION_LOST_UNREACHED_SECTIONS } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/call-report-connection-lost.util';
import type { MethodologyFacts } from './methodology-condition';
import type {
    CheckpointStatus,
    MethodologyCap,
    MethodologyCheckpoint,
    MethodologyCondition,
    MethodologyFactField,
} from './methodology.types';

/**
 * Обрыв связи в методике (решение владельца 26.11.2026): менеджера не винят
 * за то, до чего разговор не дошёл. При отмеченном обрыве ограничители «про
 * конец разговора» не срабатывают, а пропущенные пункты о конце разговора
 * считаются «не применимо». Чистые функции.
 */

/**
 * Факты о конце разговора: следующий шаг и выход на решение. Условие на
 * любой из них при обрыве судит о том, чего не было и быть не могло.
 */
export const CONNECTION_LOST_END_FACT_FIELDS = [
    'nextStepSet',
    'nextStepDate',
    'nextStepTime',
    'nextStepGoal',
    'nextStepClientAction',
    'nextStepManagerAction',
    'nextStepComplete',
    'hvostDecisionProcess',
    'hvostDecisionWay',
] as const satisfies readonly MethodologyFactField[];

const END_FACTS: ReadonlySet<string> = new Set(CONNECTION_LOST_END_FACT_FIELDS);
const UNREACHED_TARGETS: ReadonlySet<string> = new Set(
    CALL_REPORT_CONNECTION_LOST_UNREACHED_SECTIONS,
);

/** В разборе отмечен обрыв связи (факт `connectionLost` передан и равен true). */
export const isConnectionLostFacts = (facts: MethodologyFacts): boolean =>
    facts.connectionLost === true;

/** Хотя бы одно условие ссылается на факт о конце разговора. */
export const refersToCallEnd = (
    conditions: readonly MethodologyCondition[],
): boolean =>
    conditions.some(
        condition =>
            condition.field !== undefined && END_FACTS.has(condition.field),
    );

/**
 * Ограничитель «про конец разговора»: его цель — закрытие или работа с
 * отказом либо условие ссылается на факт о конце разговора.
 */
export const isCallEndCap = (cap: MethodologyCap): boolean =>
    UNREACHED_TARGETS.has(cap.target) || refersToCallEnd(cap.when);

/**
 * Статус пункта при обрыве: «пропущен» у пункта о конце разговора — «не
 * применимо»; остальные статусы и пункты — как есть.
 */
export function statusUnderConnectionLost(
    status: CheckpointStatus,
    endsCall: boolean,
    connectionLost: boolean,
): CheckpointStatus {
    return connectionLost && endsCall && status === 'missed'
        ? 'not_applicable'
        : status;
}

/** Пункт с правилом о конце разговора: помечен `ending` или правило ссылается на факт о конце. */
export const ruleEndsCall = (checkpoint: MethodologyCheckpoint): boolean =>
    checkpoint.ending === true ||
    (checkpoint.rule !== undefined && refersToCallEnd(checkpoint.rule));
