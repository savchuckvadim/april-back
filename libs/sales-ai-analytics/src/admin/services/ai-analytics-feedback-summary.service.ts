/**
 * Сводка обратной связи витрины за период (план Фазы 3, П5): записи ais
 * типа `ai-analytics-feedback` (контракт `contracts/feedback.types.ts`) —
 * реакции пользователей, факты доставки push-контура и слепые метки
 * руководителя.
 *
 * Только чтение: записи пишет приложение (витрина и push-контур).
 * Нагрузка разбирается через guard вида (`isAiAnalyticsFeedbackKind`);
 * запись чужой формы в сводку не попадает и ручку не роняет.
 */
import { Injectable } from '@nestjs/common';
import {
    AI_ANALYTICS_FEEDBACK_KINDS,
    AI_ANALYTICS_FEEDBACK_TYPE,
    AiAnalyticsFeedbackKind,
    isAiAnalyticsFeedbackKind,
} from '../../contracts/feedback.types';
import { AiAnalyticsAdminSnapshotStore } from '../ai-analytics-admin-snapshot.store';

/** Счётчик по виду записи. */
export interface FeedbackKindCount {
    kind: AiAnalyticsFeedbackKind;
    count: number;
}

/** Сводка по менеджеру: всего и по видам. */
export interface FeedbackManagerCount {
    /** Менеджер (колонка user_id); null — запись без менеджера. */
    managerId: string | null;
    total: number;
    byKind: FeedbackKindCount[];
}

/** Ответ ручки `GET admin/ai-analytics/feedback`. */
export interface FeedbackSummary {
    domain: string;
    /** Нижняя граница периода 'YYYY-MM-DD' включительно. */
    from: string;
    /** Верхняя граница периода 'YYYY-MM-DD' включительно. */
    to: string;
    /** Всего записей обратной связи в периоде. */
    total: number;
    /** Записей чужой формы (в счётчики не вошли). */
    skipped: number;
    byKind: FeedbackKindCount[];
    byManager: FeedbackManagerCount[];
    /**
     * Доля полезных реакций, %: useful / (useful + not_useful + disagree);
     * null — оценок в периоде не было.
     */
    usefulRatePct: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Виды-оценки, из которых считается доля полезных реакций. */
const RATING_KINDS: readonly AiAnalyticsFeedbackKind[] = [
    'useful',
    'not_useful',
    'disagree',
];

@Injectable()
export class AiAnalyticsFeedbackSummaryService {
    constructor(private readonly store: AiAnalyticsAdminSnapshotStore) {}

    /** Сводка домена за период дат 'YYYY-MM-DD' включительно. */
    async summary(
        domain: string,
        from: string,
        to: string,
    ): Promise<FeedbackSummary> {
        const records = await this.store.readRaw(
            domain,
            [AI_ANALYTICS_FEEDBACK_TYPE],
            { from: dayStart(from), to: dayEnd(to) },
        );
        const entries = records.flatMap(record => {
            const kind = kindOf(record.userResult);
            return kind === null
                ? []
                : [{ kind, managerId: managerOf(record.userResult) }];
        });
        return {
            domain,
            from,
            to,
            total: entries.length,
            skipped: records.length - entries.length,
            byKind: countKinds(entries),
            byManager: countManagers(entries),
            usefulRatePct: usefulRate(entries),
        };
    }
}

interface FeedbackEntry {
    kind: AiAnalyticsFeedbackKind;
    managerId: string | null;
}

function countKinds(entries: readonly FeedbackEntry[]): FeedbackKindCount[] {
    return AI_ANALYTICS_FEEDBACK_KINDS.flatMap(kind => {
        const count = entries.filter(entry => entry.kind === kind).length;
        return count > 0 ? [{ kind, count }] : [];
    });
}

function countManagers(
    entries: readonly FeedbackEntry[],
): FeedbackManagerCount[] {
    const managers = [...new Set(entries.map(entry => entry.managerId))];
    return managers
        .map(managerId => {
            const own = entries.filter(entry => entry.managerId === managerId);
            return { managerId, total: own.length, byKind: countKinds(own) };
        })
        .sort((a, b) => b.total - a.total);
}

/** Доля полезных среди оценок, % с одним знаком; оценок нет → null. */
function usefulRate(entries: readonly FeedbackEntry[]): number | null {
    const rated = entries.filter(entry => RATING_KINDS.includes(entry.kind));
    if (rated.length === 0) return null;
    const useful = rated.filter(entry => entry.kind === 'useful').length;
    return Math.round((useful / rated.length) * 1000) / 10;
}

function kindOf(userResult: unknown): AiAnalyticsFeedbackKind | null {
    if (typeof userResult !== 'object' || userResult === null) return null;
    const kind = (userResult as { kind?: unknown }).kind;
    return isAiAnalyticsFeedbackKind(kind) ? kind : null;
}

function managerOf(userResult: unknown): string | null {
    if (typeof userResult !== 'object' || userResult === null) return null;
    const managerId = (userResult as { managerId?: unknown }).managerId;
    return typeof managerId === 'string' && managerId !== '' ? managerId : null;
}

const dayStart = (day: string): Date => new Date(`${day}T00:00:00.000Z`);

const dayEnd = (day: string): Date =>
    new Date(dayStart(day).getTime() + DAY_MS);
