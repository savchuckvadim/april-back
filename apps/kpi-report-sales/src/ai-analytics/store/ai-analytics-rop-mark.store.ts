import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { AiEntityDto, AiService } from '@lib/call-lib';
import {
    AI_ANALYTICS_FEEDBACK_APP,
    AI_ANALYTICS_FEEDBACK_PROVIDER,
    AI_ANALYTICS_FEEDBACK_TYPE,
    AI_ANALYTICS_SNAPSHOT_STATUS,
    type AiAnalyticsRopMarkPayload,
    type AiAnalyticsRopMarkPickPayload,
} from '@lib/sales-ai-analytics';
import {
    isRopMarkReason,
    type RopMarkPick,
} from '@lib/sales-ai-analytics/model/rop-mark';
import {
    AI_ROP_MARK_OBJECT,
    AI_ROP_MARK_RECORD,
} from '../constants/ai-rop-mark.const';
import { supersedeAisRecords } from './ais-supersede.util';

/** Подбор недели, прочитанный из ais. */
export interface AiRopMarkPickRecord extends AiAnalyticsRopMarkPickPayload {
    id: string;
    createdAt: Date;
}

/** Метка руководителя по звонку, прочитанная из ais. */
export interface AiRopMarkRecord extends AiAnalyticsRopMarkPayload {
    id: string;
    createdAt: Date;
    transcriptionId: string;
    managerId: string | null;
    /** Bitrix-id автора метки. */
    requesterUserId: string | null;
}

export interface AiRopMarkPickInput {
    domain: string;
    weekKey: string;
    seed: number;
    generatedAt: string;
    calls: readonly RopMarkPick[];
}

export interface AiRopMarkSaveInput extends AiAnalyticsRopMarkPayload {
    domain: string;
    transcriptionId: string;
    managerId: string | null;
    requesterUserId: string;
}

const asString = (value: unknown): string | null =>
    typeof value === 'string' && value !== '' ? value : null;

const asRecord = (value: unknown): Record<string, unknown> | null =>
    typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)
        : null;

/** Самая свежая запись набора: по created_at, при равенстве — по id. */
function newest(records: readonly AiEntityDto[]): AiEntityDto | null {
    return records.reduce<AiEntityDto | null>((best, record) => {
        if (!best) return record;
        const diff = record.createdAt.getTime() - best.createdAt.getTime();
        if (diff > 0) return record;
        if (diff < 0) return best;
        return record.id > best.id ? record : best;
    }, null);
}

/** user_result записи подбора → нагрузка; чужая форма → null. */
export function parseRopMarkPick(
    userResult: unknown,
): AiAnalyticsRopMarkPickPayload | null {
    const raw = asRecord(userResult);
    const weekKey = asString(raw?.weekKey);
    if (!raw || !weekKey || !Array.isArray(raw.calls)) return null;
    const calls = raw.calls.flatMap((item: unknown): RopMarkPick[] => {
        const call = asRecord(item);
        const transcriptionId = asString(call?.transcriptionId);
        const managerId = asString(call?.managerId);
        if (!call || !transcriptionId || !managerId) return [];
        if (!isRopMarkReason(call.reason)) return [];
        return [
            {
                transcriptionId,
                managerId,
                callType: asString(call.callType),
                score: typeof call.score === 'number' ? call.score : null,
                reason: call.reason,
            },
        ];
    });
    return {
        weekKey,
        seed: typeof raw.seed === 'number' ? raw.seed : 0,
        generatedAt: asString(raw.generatedAt) ?? '',
        calls,
    };
}

/** user_result записи обратной связи → метка руководителя; иначе null. */
export function parseRopMarkPayload(
    userResult: unknown,
): AiAnalyticsRopMarkPayload | null {
    const raw = asRecord(userResult);
    if (!raw || raw.kind !== 'rop_mark') return null;
    const payload = asRecord(raw.payload);
    if (!payload || !isRopMarkReason(payload.reason)) return null;
    return {
        agree: payload.agree === true,
        ropScore:
            typeof payload.ropScore === 'number' ? payload.ropScore : null,
        sections: Array.isArray(payload.sections)
            ? payload.sections.flatMap(item => asString(item) ?? [])
            : [],
        why: asString(payload.why) ?? '',
        howTo: asString(payload.howTo) ?? '',
        reason: payload.reason,
        blind: payload.blind === true,
        weekKey: asString(payload.weekKey) ?? '',
    };
}

/**
 * Хранилище слепой проверки «три звонка недели» в таблице ais (план §3.1
 * и контракт 4): подбор недели — запись типа `ai-analytics-rop-mark` с
 * ключом ISO-недели, метка руководителя — запись обратной связи
 * `ai-analytics-feedback` с видом `rop_mark`, тем же `activity_id` и
 * `transcription_id` звонка. Одна выборка по ключу недели поднимает и
 * подбор, и метки — отдельного индекса по видам не нужно.
 *
 * Прошлые версии не удаляются: повторный подбор и повторная метка на тот
 * же звонок переводят предыдущую запись в `status: 'superseded'` (как
 * стор снапшотов), поэтому история проверок остаётся целой.
 *
 * Bitrix здесь не участвует, портал приходит параметром `domain` —
 * правило «в @Injectable нет this.bitrix» не нарушается.
 */
@Injectable()
export class AiAnalyticsRopMarkStore {
    constructor(private readonly aiService: AiService) {}

    /** Пишет подбор недели, прошлый подбор той же недели — superseded. */
    async savePick(
        input: AiRopMarkPickInput,
    ): Promise<{ id: string; supersededIds: string[] }> {
        const previous = await this.records(
            input.domain,
            AI_ROP_MARK_RECORD.TYPE,
            input.weekKey,
        );
        const supersededIds = await this.supersede(previous);
        const payload: AiAnalyticsRopMarkPickPayload = {
            weekKey: input.weekKey,
            seed: input.seed,
            generatedAt: input.generatedAt,
            calls: [...input.calls],
        };
        const created = await this.aiService.create({
            provider: AI_ROP_MARK_RECORD.PROVIDER,
            app: AI_ROP_MARK_RECORD.APP,
            type: AI_ROP_MARK_RECORD.TYPE,
            status: AI_ANALYTICS_SNAPSHOT_STATUS.done,
            activity_id: input.weekKey,
            result: `${AI_ROP_MARK_OBJECT.week(input.weekKey)}: ${
                input.calls.length
            }`,
            user_result: JSON.parse(
                JSON.stringify(payload),
            ) as Prisma.JsonValue,
            domain: input.domain,
        });
        return { id: created.id, supersededIds };
    }

    /** Актуальный подбор недели; null — подбора ещё не было. */
    async loadPick(
        domain: string,
        weekKey: string,
    ): Promise<AiRopMarkPickRecord | null> {
        const record = newest(
            await this.records(domain, AI_ROP_MARK_RECORD.TYPE, weekKey),
        );
        if (!record) return null;
        const payload = parseRopMarkPick(record.user_result);
        return payload
            ? { id: record.id, createdAt: record.createdAt, ...payload }
            : null;
    }

    /** Метки недели: по одной актуальной на звонок. */
    async listMarks(
        domain: string,
        weekKey: string,
    ): Promise<AiRopMarkRecord[]> {
        const records = await this.records(
            domain,
            AI_ANALYTICS_FEEDBACK_TYPE,
            weekKey,
        );
        return records.flatMap(record => this.toMark(record));
    }

    /**
     * Пишет метку; предыдущая метка того же звонка уходит в superseded —
     * актуальной остаётся последняя (повторная метка заменяет прежнюю).
     */
    async saveMark(
        input: AiRopMarkSaveInput,
    ): Promise<{ id: string; replacedIds: string[] }> {
        const { domain, transcriptionId, managerId, requesterUserId, ...mark } =
            input;
        const previous = (
            await this.records(domain, AI_ANALYTICS_FEEDBACK_TYPE, mark.weekKey)
        ).filter(record => record.transcription_id === transcriptionId);
        const replacedIds = await this.supersede(previous);
        const userResult = {
            kind: 'rop_mark',
            object: AI_ROP_MARK_OBJECT.call(transcriptionId),
            managerId,
            transcriptionId,
            requesterUserId,
            reason: mark.reason,
            payload: mark,
        };
        const created = await this.aiService.create({
            provider: AI_ANALYTICS_FEEDBACK_PROVIDER,
            app: AI_ANALYTICS_FEEDBACK_APP,
            type: AI_ANALYTICS_FEEDBACK_TYPE,
            status: AI_ANALYTICS_SNAPSHOT_STATUS.done,
            activity_id: mark.weekKey,
            transcription_id: transcriptionId,
            result: `rop_mark: ${AI_ROP_MARK_OBJECT.call(transcriptionId)}`,
            user_result: JSON.parse(
                JSON.stringify(userResult),
            ) as Prisma.JsonValue,
            domain,
            ...(Number.isInteger(Number(requesterUserId))
                ? { user_id: Number(requesterUserId) }
                : {}),
        });
        return { id: created.id, replacedIds };
    }

    /** Актуальные записи типа по ключу недели (в порядке выдачи ais). */
    private async records(
        domain: string,
        type: string,
        weekKey: string,
    ): Promise<AiEntityDto[]> {
        const records = await this.aiService.findByDomainTypeKeys(
            domain,
            type,
            { activityIds: [weekKey] },
        );
        return records.filter(
            record => record.status !== AI_ANALYTICS_SNAPSHOT_STATUS.superseded,
        );
    }

    /** Переводит записи в superseded; возвращает их id. */
    private supersede(records: AiEntityDto[]): Promise<string[]> {
        return supersedeAisRecords(
            this.aiService,
            records.map(record => record.id),
        );
    }

    private toMark(record: AiEntityDto): AiRopMarkRecord[] {
        const payload = parseRopMarkPayload(record.user_result);
        const raw = asRecord(record.user_result);
        const transcriptionId =
            asString(record.transcription_id) ?? asString(raw?.transcriptionId);
        if (!payload || !transcriptionId) return [];
        return [
            {
                id: record.id,
                createdAt: record.createdAt,
                transcriptionId,
                managerId: asString(raw?.managerId),
                requesterUserId: asString(raw?.requesterUserId),
                ...payload,
            },
        ];
    }
}
