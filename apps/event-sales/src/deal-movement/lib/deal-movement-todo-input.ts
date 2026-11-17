import {
    asRecord,
    asString,
} from '@lib/call-lib/call-report-analytics/lib/json-value.util';
import type { ETimeZone } from '@lib/shared/lib/date';
import {
    dealMovementReasonTexts,
    dealMovementShortDate,
    type DealMovementTodoInput,
    type DealMovementVerdict,
} from '@lib/sales-ai-analytics';
import type { DealMovementCallPointers } from '../types/deal-movement.types';
import { dealMovementDayKey } from './deal-movement-schedule';

/** Резюме звонка длиннее — обрезается: модели хватает сути. */
export const DEAL_MOVEMENT_TODO_SUMMARY_MAX = 600;

const clip = (text: string | null): string | null =>
    text !== null && text.length > DEAL_MOVEMENT_TODO_SUMMARY_MAX
        ? `${text.slice(0, DEAL_MOVEMENT_TODO_SUMMARY_MAX).trimEnd()}…`
        : text;

const nonEmpty = (text: string | null): string | null =>
    text !== null && text.trim() !== '' ? text.trim() : null;

/**
 * Вердикт сделки и перечитанные разборы → вход модели «что сделать»:
 * статус и причины словами, дни в стадии, договорённость (дата шага и о
 * чём — `nextStep.description`) и последний звонок (день по поясу портала,
 * `summary`, `dealProgress.after`). Разбор другой версии промпта — поле не
 * того типа читается как «не указано». Чистая функция.
 */
export function toDealMovementTodoInput(input: {
    verdict: Pick<DealMovementVerdict, 'status' | 'reasons' | 'facts'>;
    pointers: DealMovementCallPointers | null;
    /** user_result разбора последнего звонка; null — не нашёлся. */
    lastCallAnalysis: unknown;
    /** user_result разбора звонка с договорённостью; null — не нашёлся. */
    agreementAnalysis: unknown;
    timezone: ETimeZone;
}): DealMovementTodoInput {
    const { verdict, pointers } = input;
    const agreement = asRecord(input.agreementAnalysis);
    const lastCall = asRecord(input.lastCallAnalysis);
    const agreementDate = pointers?.lastAgreement?.date ?? null;
    const lastCallAt = pointers?.lastCall?.at ?? null;
    return {
        status: verdict.status,
        reasons: dealMovementReasonTexts(verdict),
        daysInStage: verdict.facts.daysInStage,
        agreement: pointers?.lastAgreement
            ? {
                  date: agreementDate
                      ? dealMovementShortDate(agreementDate)
                      : null,
                  text: nonEmpty(
                      asString(asRecord(agreement?.nextStep)?.description),
                  ),
              }
            : null,
        lastCall: pointers?.lastCall
            ? {
                  date: lastCallAt
                      ? dealMovementShortDate(
                            dealMovementDayKey(
                                new Date(lastCallAt),
                                input.timezone,
                            ),
                        )
                      : null,
                  summary: clip(nonEmpty(asString(lastCall?.summary))),
                  after: nonEmpty(
                      asString(asRecord(lastCall?.dealProgress)?.after),
                  ),
              }
            : null,
    };
}
