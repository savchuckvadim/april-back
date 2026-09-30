import { Injectable } from '@nestjs/common';
import {
    AI_LEVERS,
    parseLeverKey,
    type AiEvidenceLevel,
    type AiLever,
} from '@lib/sales-ai-analytics';
import { leverFeedbackObjectOf } from '../constants/ai-analytics.const';
import { shiftMonth } from '../constants/ai-dossier.const';
import {
    AI_RECOMMENDATION_FEEDBACK_KINDS,
    AI_RECOMMENDATION_LOG_SLACK_DAYS,
} from '../constants/ai-recommendation-effect.const';
import {
    AiAnalyticsFeedbackStore,
    type AiAnalyticsFeedbackRecord,
} from './ai-analytics-feedback.store';

/** Ключ дедупа выдачи: один совет — одна запись на менеджера и месяц. */
export interface AiRecommendationIssuedKey {
    readonly domain: string;
    readonly managerId: string;
    /** Ключ совета `leverKeyOf(candidate)`. */
    readonly key: string;
    /** Месяц выдачи 'YYYY-MM'. */
    readonly monthKey: string;
}

/** Что запоминается о выданном совете (payload записи обратной связи). */
export interface AiRecommendationIssuedPayload {
    readonly day: string;
    readonly monthKey: string;
    readonly key: string;
    readonly lever: AiLever;
    readonly ruleCode: string;
    readonly deltaSales: number | null;
    readonly ci80: readonly [number, number] | null;
    readonly evidence: AiEvidenceLevel;
    readonly calcVersion: string;
}

/** Выданный совет, прочитанный из журнала. */
export interface AiRecommendationIssuedRecord {
    /** Объект записи `lever:{managerId}:{key}`. */
    readonly object: string;
    readonly managerId: string;
    readonly key: string;
    readonly lever: AiLever;
    readonly monthKey: string;
}

/** Журнал за окно: выданные в месяц советы и реакции на них. */
export interface AiRecommendationWindow {
    readonly issued: readonly AiRecommendationIssuedRecord[];
    /** Объекты советов с отметкой «Сделано» в окне. */
    readonly done: ReadonlySet<string>;
    /** Объекты советов с несогласием в окне. */
    readonly disagree: ReadonlySet<string>;
}

/** Реакции на совет, которые читает эффект: «Сделано» и несогласие. */
type AiRecommendationReactionKind =
    | typeof AI_RECOMMENDATION_FEEDBACK_KINDS.done
    | typeof AI_RECOMMENDATION_FEEDBACK_KINDS.disagree;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Объект совета: 'lever:{managerId}:{ключ совета}'. */
export function leverObject(managerId: string, key: string): string {
    return leverFeedbackObjectOf(managerId, key);
}

/** Период `created_at` месяцев [from; to] с запасом на часовой пояс. */
export function monthsPeriod(
    fromMonth: string,
    toMonth: string,
): { from: Date; to: Date } {
    const slack = AI_RECOMMENDATION_LOG_SLACK_DAYS * DAY_MS;
    const from = Date.parse(`${fromMonth}-01T00:00:00Z`) - slack;
    const to = Date.parse(`${shiftMonth(toMonth, 1)}-01T00:00:00Z`) + slack;

    return { from: new Date(from), to: new Date(to) };
}

const isLever = (value: unknown): value is AiLever =>
    typeof value === 'string' &&
    (AI_LEVERS as readonly string[]).includes(value);

/** Запись выдачи → совет; чужая форма → null. */
function issuedOf(
    record: AiAnalyticsFeedbackRecord,
): AiRecommendationIssuedRecord | null {
    if (record.kind !== AI_RECOMMENDATION_FEEDBACK_KINDS.issued) return null;
    const payload = record.payload ?? {};
    const managerId = record.managerId;
    const key = typeof payload.key === 'string' ? payload.key : null;
    if (managerId === null || key === null) return null;
    if (typeof payload.monthKey !== 'string') return null;
    const lever = isLever(payload.lever)
        ? payload.lever
        : (parseLeverKey(key)?.lever ?? null);
    if (lever === null || record.object !== leverObject(managerId, key)) {
        return null;
    }

    return {
        object: record.object,
        managerId,
        key,
        lever,
        monthKey: payload.monthKey,
    };
}

/** Одна запись выдачи на объект (дубли гонки отбрасываются). */
function uniqueIssued(
    records: readonly AiAnalyticsFeedbackRecord[],
    monthKey: string,
): AiRecommendationIssuedRecord[] {
    const byObject = new Map<string, AiRecommendationIssuedRecord>();
    for (const record of records) {
        const issued = issuedOf(record);
        if (issued === null || issued.monthKey !== monthKey) continue;
        if (!byObject.has(issued.object)) byObject.set(issued.object, issued);
    }

    return [...byObject.values()];
}

/**
 * Объекты советов с реакцией вида `kind`. Реакция засчитывается, только
 * если менеджер записи совпадает с менеджером в объекте совета
 * (`lever:{managerId}:…`): отметка по чужому совету (менеджер по совету
 * коллеги, руководитель без менеджера в записи) эффект не двигает.
 */
function objectsOf(
    records: readonly AiAnalyticsFeedbackRecord[],
    kind: AiRecommendationReactionKind,
): Set<string> {
    return new Set(
        records
            .filter(
                record =>
                    record.kind === kind &&
                    record.managerId !== null &&
                    record.object.startsWith(leverObject(record.managerId, '')),
            )
            .map(record => record.object),
    );
}

/**
 * Журнал выданных советов поверх записей обратной связи
 * (`AiAnalyticsFeedbackStore`, по образцу журнала доставки
 * `ai-analytics-push-log.store.ts`): служебный вид `recommendation_issued`,
 * объект `lever:{managerId}:{ключ}`. Дедуп — одна запись на (менеджер,
 * ключ, месяц): перед записью — `wasIssued`/`issuedObjects`, после —
 * `markIssued`. Эффект советов читает окно целиком (`readWindow`).
 */
@Injectable()
export class AiAnalyticsRecommendationLogStore {
    constructor(private readonly feedback: AiAnalyticsFeedbackStore) {}

    /** Объекты советов, уже выданных в месяце (один запрос на прогон). */
    async issuedObjects(
        domain: string,
        monthKey: string,
    ): Promise<Set<string>> {
        const period = monthsPeriod(monthKey, monthKey);
        const records = await this.feedback.listInPeriod(
            domain,
            period.from,
            period.to,
        );

        return new Set(
            uniqueIssued(records, monthKey).map(issued => issued.object),
        );
    }

    /** Совет уже выдан менеджеру в этом месяце. */
    async wasIssued(key: AiRecommendationIssuedKey): Promise<boolean> {
        const objects = await this.issuedObjects(key.domain, key.monthKey);

        return objects.has(leverObject(key.managerId, key.key));
    }

    /** Отметка выдачи; возвращает id записи `ais`. */
    async markIssued(
        key: AiRecommendationIssuedKey,
        payload: Omit<AiRecommendationIssuedPayload, 'key' | 'monthKey'>,
    ): Promise<string> {
        const full: AiRecommendationIssuedPayload = {
            ...payload,
            key: key.key,
            monthKey: key.monthKey,
        };

        return this.feedback.add({
            domain: key.domain,
            kind: AI_RECOMMENDATION_FEEDBACK_KINDS.issued,
            object: leverObject(key.managerId, key.key),
            managerId: key.managerId,
            transcriptionId: null,
            requesterUserId: null,
            reason: null,
            payload: {
                ...full,
                ci80: full.ci80 === null ? null : [...full.ci80],
            },
        });
    }

    /**
     * Окно эффекта: советы, выданные в `issuedMonth`, и реакции на них
     * («Сделано», несогласие) с начала месяца выдачи по `untilMonth`.
     */
    async readWindow(
        domain: string,
        issuedMonth: string,
        untilMonth: string,
    ): Promise<AiRecommendationWindow> {
        const period = monthsPeriod(issuedMonth, untilMonth);
        const records = await this.feedback.listInPeriod(
            domain,
            period.from,
            period.to,
        );

        return {
            issued: uniqueIssued(records, issuedMonth),
            done: objectsOf(records, AI_RECOMMENDATION_FEEDBACK_KINDS.done),
            disagree: objectsOf(
                records,
                AI_RECOMMENDATION_FEEDBACK_KINDS.disagree,
            ),
        };
    }
}
