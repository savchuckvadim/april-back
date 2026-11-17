import type { TranscriptionPipelineLiteView } from '@lib/call-lib';
import { mapLiteAnalysis } from '@lib/call-lib/call-report-analytics/lib/analytics-lite.mapper';
import {
    asNumber,
    asRecord,
} from '@lib/call-lib/call-report-analytics/lib/json-value.util';
import type { DealMovementCallRef } from '../types/deal-movement.types';
import { toPositiveId } from './deal-movement-deal-row';

/**
 * Строка расшифровки и нагрузка её действующего разбора → звонок в
 * объёме правил: момент, продвижение 1–5, договорённость и догадка разбора
 * об основной сделке. Нагрузка — JSON разных версий промпта: поле не того
 * типа читается как отсутствующее. Без момента звонка — null.
 */
export function toDealMovementCallRef(
    row: Pick<
        TranscriptionPipelineLiteView,
        'id' | 'callStartedAt' | 'createdAt' | 'entityType' | 'entityId'
    >,
    userResult: unknown,
): DealMovementCallRef | null {
    const moment = row.callStartedAt ?? row.createdAt;
    if (!moment) return null;
    const analysis = asRecord(userResult);
    const lite = mapLiteAnalysis(analysis);
    const related = analysis ? asRecord(analysis.relatedDeals) : null;
    const mainDealId = related ? asNumber(related.mainDealId) : null;
    return {
        transcriptionId: row.id,
        entityType: row.entityType ? row.entityType.trim().toLowerCase() : null,
        entityId: toPositiveId(row.entityId),
        mainDealId:
            mainDealId !== null &&
            Number.isInteger(mainDealId) &&
            mainDealId > 0
                ? mainDealId
                : null,
        call: {
            at: moment.toISOString(),
            progress: lite.methodology?.dealProgress ?? null,
            nextStep: lite.nextStep
                ? { set: lite.nextStep.set, date: lite.nextStep.date }
                : null,
        },
    };
}
