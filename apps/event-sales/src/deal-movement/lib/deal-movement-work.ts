import { BitrixActivityTypeId } from '@lib/bitrix/domain/enums/bitrix-constants.enum';
import type { DealMovementWork } from '@lib/sales-ai-analytics';
import { scalarText } from '../../event-report/services/entity/scalar-text.util';
import { DEAL_MOVEMENT_WORK } from '../constants/deal-movement.const';

/**
 * Строки `crm.activity.list` → работа по сделке (решение 20.11.2026). Формат
 * Битрикса (строки, даты с поясом) дальше этой функции не уходит. Чистые
 * функции.
 *
 * - звонок (тип «звонок» или провайдер типа «звонок») — момент начала;
 *   короче `missedCallMaxSec` по началу и концу — недозвон;
 * - задача (дело-зеркало задачи) и прочее дело — закрытое: момент
 *   последнего изменения (закрытие), открытое — момент создания.
 *
 * Строки без разборчивого момента и с моментом раньше `fromMs` (дело
 * старое, а изменили его недавно — например, перенесли срок) пропускаются.
 */

const timeOf = (raw: unknown): number | null => {
    const text = scalarText(raw).trim();
    if (!text) return null;
    const ms = Date.parse(text);
    return Number.isNaN(ms) ? null : ms;
};

/** Тип дела «звонок» числом: `TYPE_ID` приходит строкой. */
const CALL_TYPE_ID: number = BitrixActivityTypeId.CALL;

const isCall = (row: Readonly<Record<string, unknown>>): boolean =>
    Number(scalarText(row['TYPE_ID'])) === CALL_TYPE_ID ||
    scalarText(row['PROVIDER_TYPE_ID']) === DEAL_MOVEMENT_WORK.callProviderType;

/** Недозвон: известны начало и конец, и разговор короче порога. */
function isMissedCall(row: Readonly<Record<string, unknown>>): boolean {
    const start = timeOf(row['START_TIME']);
    const end = timeOf(row['END_TIME']);
    if (start === null || end === null || end < start) return false;
    return end - start < DEAL_MOVEMENT_WORK.missedCallMaxSec * 1000;
}

/** Одна строка дела → работа; не разобрать или старое — null. */
export function toDealMovementWork(
    row: Readonly<Record<string, unknown>>,
    fromMs: number,
): DealMovementWork | null {
    let atMs: number | null;
    let work: Omit<DealMovementWork, 'at'>;
    if (isCall(row)) {
        atMs = timeOf(row['START_TIME']) ?? timeOf(row['CREATED']);
        work = { kind: 'call', missed: isMissedCall(row) };
    } else {
        const closed = scalarText(row['COMPLETED']) === DEAL_MOVEMENT_WORK.yes;
        atMs = closed
            ? (timeOf(row['LAST_UPDATED']) ?? timeOf(row['CREATED']))
            : timeOf(row['CREATED']);
        const task =
            scalarText(row['PROVIDER_ID']) === DEAL_MOVEMENT_WORK.taskProvider;
        work = { kind: task ? 'task' : 'activity', missed: false };
    }
    if (atMs === null || atMs < fromMs) return null;
    return { ...work, at: new Date(atMs).toISOString() };
}

/** Ответ команды (массив строк дел) → работа по сделке. */
export function dealMovementWorkOf(
    rows: unknown,
    fromMs: number,
): DealMovementWork[] {
    if (!Array.isArray(rows)) return [];
    const work: DealMovementWork[] = [];
    for (const row of rows as unknown[]) {
        if (typeof row !== 'object' || row === null) continue;
        const item = toDealMovementWork(
            row as Readonly<Record<string, unknown>>,
            fromMs,
        );
        if (item !== null) work.push(item);
    }
    return work;
}
