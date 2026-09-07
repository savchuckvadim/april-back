import { Injectable } from '@nestjs/common';
import { AiAnalyticsFeedbackKind } from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_PUSH_OBJECTS } from '../constants/ai-analytics.const';
import { AiAnalyticsFeedbackStore } from './ai-analytics-feedback.store';

/** Виды записей доставки push-контура (подмножество kind'ов контракта 4). */
export type AiAnalyticsPushSentKind = Extract<
    AiAnalyticsFeedbackKind,
    'agenda_sent' | 'digest_sent'
>;

export interface AiAnalyticsPushSentKey {
    domain: string;
    kind: AiAnalyticsPushSentKind;
    /** 'agenda:{weekKey}' | 'digest:{day}' | 'digest_all:{day}' — см. *Object(). */
    object: string;
    /** Менеджер (личный дайджест); у повестки и сводного дайджеста null. */
    managerId: string | null;
}

export interface AiAnalyticsPushSentInput extends AiAnalyticsPushSentKey {
    payload: Record<string, unknown>;
}

export function agendaObject(weekKey: string): string {
    return `${AI_ANALYTICS_PUSH_OBJECTS.AGENDA_PREFIX}${weekKey}`;
}

export function digestObject(day: string): string {
    return `${AI_ANALYTICS_PUSH_OBJECTS.DIGEST_PREFIX}${day}`;
}

/** Сводный дайджест: тот же kind digest_sent, object 'digest_all:{day}', managerId = null. */
export function digestAllObject(day: string): string {
    return `${AI_ANALYTICS_PUSH_OBJECTS.DIGEST_ALL_PREFIX}${day}`;
}

/**
 * Журнал доставки push-контура поверх ais-записей контракта 4
 * (AiAnalyticsFeedbackStore): идемпотентность рассылок — одна запись
 * agenda_sent на домен+неделю, одна digest_sent на домен+менеджер+день
 * (личный дайджест) и одна digest_sent с object digest_all:{day} без
 * менеджера на домен+день (сводный дайджест).
 * Перед отправкой — wasSent, после успешной доставки — markSent.
 */
@Injectable()
export class AiAnalyticsPushLogStore {
    constructor(private readonly feedback: AiAnalyticsFeedbackStore) {}

    /**
     * Есть ли запись доставки с таким ключом среди записей, созданных с
     * `since` по `until` (записи не могут появиться раньше начала периода).
     */
    async wasSent(
        key: AiAnalyticsPushSentKey,
        since: Date,
        until: Date = new Date(),
    ): Promise<boolean> {
        const records = await this.feedback.listInPeriod(
            key.domain,
            since,
            until,
        );
        return records.some(
            record =>
                record.kind === key.kind &&
                record.object === key.object &&
                record.managerId === key.managerId,
        );
    }

    /** Отметка доставки; возвращает id ais-записи. */
    async markSent(input: AiAnalyticsPushSentInput): Promise<string> {
        return this.feedback.add({
            domain: input.domain,
            kind: input.kind,
            object: input.object,
            managerId: input.managerId,
            transcriptionId: null,
            requesterUserId: null,
            reason: null,
            payload: input.payload,
        });
    }
}
