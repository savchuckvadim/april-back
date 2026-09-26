import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { AiEntityDto, AiService } from '@lib/call-lib';
import {
    AI_ANALYTICS_FEEDBACK_APP,
    AI_ANALYTICS_FEEDBACK_PROVIDER,
    AI_ANALYTICS_FEEDBACK_TYPE,
    AI_ANALYTICS_SNAPSHOT_STATUS,
    AiAnalyticsFeedbackKind,
    AiAnalyticsFeedbackPayload,
    isAiAnalyticsFeedbackKind,
} from '@lib/sales-ai-analytics';
import { supersedeAisRecords } from './ais-supersede.util';

/** Запись обратной связи/доставки, прочитанная из ais. */
export interface AiAnalyticsFeedbackRecord extends AiAnalyticsFeedbackPayload {
    id: string;
    createdAt: Date;
    /**
     * Статус ais-записи: 'done' — актуальная, 'superseded' — замещённая
     * (повторная метка руководителя и смена оценки useful/not_useful в
     * тот же день переводят прежнюю запись в superseded).
     */
    status: string;
}

/** Опции выборки записей за период. */
export interface AiAnalyticsFeedbackListOptions {
    /**
     * Отдавать и замещённые (superseded) записи. По умолчанию — нет:
     * витрина, досье и счётчики видят только актуальные записи.
     */
    includeSuperseded?: boolean;
}

export interface AiAnalyticsFeedbackInput {
    domain: string;
    kind: AiAnalyticsFeedbackKind;
    object: string;
    managerId: string | null;
    transcriptionId: string | null;
    requesterUserId: string | null;
    reason: string | null;
    payload?: Record<string, unknown>;
}

const asNullableString = (value: unknown): string | null =>
    typeof value === 'string' && value !== '' ? value : null;

/** user_result ais-записи → payload контракта 4; чужая форма → null. */
export function parseFeedbackPayload(
    userResult: unknown,
): AiAnalyticsFeedbackPayload | null {
    if (typeof userResult !== 'object' || userResult === null) return null;
    const raw = userResult as Record<string, unknown>;
    if (!isAiAnalyticsFeedbackKind(raw.kind)) return null;
    const object = asNullableString(raw.object);
    if (!object) return null;
    const payload =
        typeof raw.payload === 'object' && raw.payload !== null
            ? (raw.payload as Record<string, unknown>)
            : undefined;
    return {
        kind: raw.kind,
        object,
        managerId: asNullableString(raw.managerId),
        transcriptionId: asNullableString(raw.transcriptionId),
        requesterUserId: asNullableString(raw.requesterUserId),
        reason: asNullableString(raw.reason),
        ...(payload ? { payload } : {}),
    };
}

/**
 * Хранилище обратной связи и фактов доставки AI-аналитики в таблице ais
 * (контракт 4 плана): type/app/provider фиксированы константами lib,
 * user_result — AiAnalyticsFeedbackPayload, transcription_id — если реакция
 * про звонок. Один источник записи для витрины (feedback) и push-контура
 * (digest_sent/agenda_sent — шаг 2); alert_sent пишет event-sales тем же
 * контрактом.
 */
@Injectable()
export class AiAnalyticsFeedbackStore {
    constructor(private readonly aiService: AiService) {}

    /** Пишет запись, возвращает id ais. */
    async add(input: AiAnalyticsFeedbackInput): Promise<string> {
        const userResult: AiAnalyticsFeedbackPayload = {
            kind: input.kind,
            object: input.object,
            managerId: input.managerId,
            transcriptionId: input.transcriptionId,
            requesterUserId: input.requesterUserId,
            reason: input.reason,
            ...(input.payload ? { payload: input.payload } : {}),
        };
        const created = await this.aiService.create({
            provider: AI_ANALYTICS_FEEDBACK_PROVIDER,
            app: AI_ANALYTICS_FEEDBACK_APP,
            type: AI_ANALYTICS_FEEDBACK_TYPE,
            status: AI_ANALYTICS_SNAPSHOT_STATUS.done,
            result: `${input.kind}: ${input.object}`,
            user_result: JSON.parse(
                JSON.stringify(userResult),
            ) as Prisma.JsonValue,
            domain: input.domain,
            ...(input.transcriptionId
                ? { transcription_id: input.transcriptionId }
                : {}),
            ...(input.requesterUserId &&
            Number.isInteger(Number(input.requesterUserId))
                ? { user_id: Number(input.requesterUserId) }
                : {}),
        });
        return created.id;
    }

    /**
     * Переводит записи в superseded (повторная оценка useful/not_useful
     * того же дня замещает прежнюю); возвращает id замещённых.
     */
    supersede(ids: readonly string[]): Promise<string[]> {
        return supersedeAisRecords(this.aiService, ids);
    }

    /**
     * Записи домена за период (по created_at), опционально по менеджеру.
     * Замещённые (superseded) записи по умолчанию отсекаются — см.
     * `AiAnalyticsFeedbackListOptions.includeSuperseded`.
     */
    async listInPeriod(
        domain: string,
        from: Date,
        to: Date,
        managerId?: string,
        options: AiAnalyticsFeedbackListOptions = {},
    ): Promise<AiAnalyticsFeedbackRecord[]> {
        const records = await this.aiService.findByDomainTypesInPeriod(
            domain,
            [AI_ANALYTICS_FEEDBACK_TYPE],
            from,
            to,
        );
        return records
            .flatMap(record => this.toRecord(record))
            .filter(
                record =>
                    options.includeSuperseded === true ||
                    record.status !== AI_ANALYTICS_SNAPSHOT_STATUS.superseded,
            )
            .filter(record => !managerId || record.managerId === managerId);
    }

    private toRecord(record: AiEntityDto): AiAnalyticsFeedbackRecord[] {
        const payload = parseFeedbackPayload(record.user_result);
        if (!payload) return [];
        return [
            {
                id: record.id,
                createdAt: record.createdAt,
                // Пустой статус (старые записи) считаем актуальным.
                status: record.status || AI_ANALYTICS_SNAPSHOT_STATUS.done,
                ...payload,
            },
        ];
    }
}
