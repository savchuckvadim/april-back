/**
 * Сигнал руководителю по строке звонка из шины конвейера — для правила
 * санити-панели «шум алертов». Считается тем же правилом, что пульс и
 * уведомление РОПу (resolveManagerSignal, решение владельца 11.11.2026):
 * ошибка менеджера, а не возражение клиента и не срочный коучинг.
 *
 * Строка шины разбирается осторожно: чужая или неполная форма даёт пустые
 * значения, а не падение панели (как в остальном sanity.facts).
 */
import { CALL_REPORT_ACTIVE_RISK_FLAG_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import {
    resolveManagerSignal,
    type ManagerSignalCallView,
    type ManagerSignalObjection,
    type ManagerSignalSection,
    type RiskEvidenceLike,
} from '@lib/sales-ai-analytics';

export const asRecord = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : null;

const textOrNull = (value: unknown): string | null =>
    typeof value === 'string' ? value : null;

const boolOrNull = (value: unknown): boolean | null =>
    typeof value === 'boolean' ? value : null;

const numOrNull = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Записи массива шины; не массив — пусто, не объект — пропуск. */
const recordsOf = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value)
        ? value.flatMap((item: unknown) => {
              const record = asRecord(item);
              return record ? [record] : [];
          })
        : [];

const stringsOf = (value: unknown): string[] =>
    Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];

/** Доказательства флагов из строки шины (чужая форма отбрасывается). */
const riskEvidenceOf = (value: unknown): RiskEvidenceLike[] =>
    recordsOf(value).flatMap(record =>
        typeof record.flag === 'string'
            ? [{ flag: record.flag, quote: textOrNull(record.quote) }]
            : [],
    );

const objectionsOf = (value: unknown): ManagerSignalObjection[] =>
    recordsOf(value).map(record => ({
        quote: textOrNull(record.quote),
        handled: boolOrNull(record.handled),
        outcome: textOrNull(record.outcome),
        reaction: textOrNull(record.reaction),
    }));

const sectionsOf = (value: unknown): ManagerSignalSection[] =>
    recordsOf(value).flatMap(record =>
        typeof record.section === 'string'
            ? [
                  {
                      section: record.section,
                      relevance: numOrNull(record.relevance) ?? 0,
                      score: numOrNull(record.score),
                      asWas: textOrNull(record.asWas),
                  },
              ]
            : [],
    );

/** Проекция строки шины для правила сигнала. */
export function signalViewOf(
    row: Record<string, unknown>,
): ManagerSignalCallView {
    const style = asRecord(row.style);
    const methodology = asRecord(row.methodology);
    return {
        riskFlags: stringsOf(row.riskFlags),
        riskEvidence: riskEvidenceOf(row.riskEvidence),
        objections: objectionsOf(row.objections),
        sections: sectionsOf(row.sections),
        presentationDone: boolOrNull(style?.presentationDone),
        needsFound: boolOrNull(style?.needsFound),
        spiralsFull: numOrNull(methodology?.spiralsFull),
    };
}

/** Есть ли у строки сигнал руководителю (флаги — как в пульсе, все действующие). */
export const hasManagerSignal = (row: Record<string, unknown>): boolean =>
    resolveManagerSignal(
        signalViewOf(row),
        CALL_REPORT_ACTIVE_RISK_FLAG_CODES,
    ) !== null;
