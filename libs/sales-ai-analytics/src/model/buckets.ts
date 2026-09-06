import {
    AI_ANALYTICS_BUCKETS,
    AI_ANALYTICS_EVENT_KINDS,
    AiAnalyticsBucket,
} from '@lib/portal-lib/pbx/pbx-aicall-smart/type/ai-analytics-event-map.const';
import {
    CALL_REPORT_CALL_TYPE_CODES,
    CallReportCallTypeCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import { MetricValue, scoreMetric } from './metric';

/** Оценка звонка в шкале 1–10 с типом звонка, к которому она относится. */
export interface BucketScoreInput {
    callType: string | null;
    score: number;
}

/** Корзина оценок за период: n и среднее (none при n < 8). */
export interface BucketScore {
    bucket: AiAnalyticsBucket;
    n: number;
    score: MetricValue;
}

/** Строка — известный AI-тип звонка (CALL_REPORT_CALL_TYPE_CODES). */
export function isCallTypeCode(
    value: string | null | undefined,
): value is CallReportCallTypeCode {
    return (
        typeof value === 'string' &&
        (CALL_REPORT_CALL_TYPE_CODES as readonly string[]).includes(value)
    );
}

/**
 * Корзина типа по карте алфавитов (план §2.2): контакт —
 * cold + site_lead + call; презентация; закрытие — refine + decision +
 * payment. other / irrelevant и неизвестные типы → null.
 */
export function bucketOfCallType(
    callType: string | null | undefined,
): AiAnalyticsBucket | null {
    return isCallTypeCode(callType)
        ? AI_ANALYTICS_EVENT_KINDS[callType].bucket
        : null;
}

/** Типы корзины в порядке справочника. */
export function callTypesOfBucket(
    bucket: AiAnalyticsBucket,
): CallReportCallTypeCode[] {
    return CALL_REPORT_CALL_TYPE_CODES.filter(
        code => AI_ANALYTICS_EVENT_KINDS[code].bucket === bucket,
    );
}

const typeRank = (callType: string): number => {
    const index = (CALL_REPORT_CALL_TYPE_CODES as readonly string[]).indexOf(
        callType,
    );
    return index === -1 ? CALL_REPORT_CALL_TYPE_CODES.length : index;
};

/**
 * Детерминированный порядок типов: известные — по справочнику,
 * неизвестные — после них по алфавиту.
 */
export const compareCallTypes = (a: string, b: string): number =>
    typeRank(a) - typeRank(b) || a.localeCompare(b);

/**
 * Оценки по трём корзинам (всегда все три, в порядке AI_ANALYTICS_BUCKETS):
 * n — число оценок корзины, score — scoreMetric (none при n < 8).
 * Записи без корзины (other, irrelevant, неизвестный тип) не участвуют.
 */
export function aggregateBucketScores(
    entries: readonly BucketScoreInput[],
): BucketScore[] {
    const values = new Map<AiAnalyticsBucket, number[]>(
        AI_ANALYTICS_BUCKETS.map(bucket => [bucket, []]),
    );
    for (const entry of entries) {
        const bucket = bucketOfCallType(entry.callType);
        if (bucket !== null && Number.isFinite(entry.score)) {
            values.get(bucket)?.push(entry.score);
        }
    }
    return AI_ANALYTICS_BUCKETS.map(bucket => {
        const scores = values.get(bucket) ?? [];
        return { bucket, n: scores.length, score: scoreMetric(scores) };
    });
}
