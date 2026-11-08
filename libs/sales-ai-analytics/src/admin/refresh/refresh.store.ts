import { Injectable } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    AI_REFRESH_DEFAULTS,
    AI_REFRESH_STEP_CODES,
    AI_REFRESH_STEP_STATES,
    type AiRefreshScenario,
    type AiRefreshStep,
} from './refresh.types';

const KEY_PREFIX = 'sales-ai-analytics:refresh';

/** Ключ сценария портала: один сценарий на домен. */
export const aiRefreshKey = (domain: string): string =>
    `${KEY_PREFIX}:${domain}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringOrNull = (value: unknown): value is string | null =>
    value === null || typeof value === 'string';

function isStep(value: unknown): value is AiRefreshStep {
    return (
        isRecord(value) &&
        (AI_REFRESH_STEP_CODES as readonly unknown[]).includes(value.code) &&
        (AI_REFRESH_STEP_STATES as readonly unknown[]).includes(value.state) &&
        typeof value.title === 'string' &&
        isStringOrNull(value.phase) &&
        isStringOrNull(value.startedAt) &&
        isStringOrNull(value.finishedAt) &&
        isStringOrNull(value.text)
    );
}

/** Сценарий из Redis; чужая форма (старая версия, мусор) — null. */
export function parseAiRefreshScenario(
    raw: string | null,
): AiRefreshScenario | null {
    if (raw === null) return null;
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return null;
    }
    if (
        !isRecord(value) ||
        typeof value.id !== 'string' ||
        typeof value.domain !== 'string' ||
        typeof value.monthKey !== 'string' ||
        typeof value.from !== 'string' ||
        typeof value.to !== 'string' ||
        typeof value.withReanalysis !== 'boolean' ||
        typeof value.startedAt !== 'string' ||
        typeof value.updatedAt !== 'string' ||
        typeof value.finished !== 'boolean' ||
        !isStringOrNull(value.requestedBy) ||
        !Array.isArray(value.steps) ||
        !value.steps.every(isStep)
    ) {
        return null;
    }
    return {
        id: value.id,
        domain: value.domain,
        monthKey: value.monthKey,
        from: value.from,
        to: value.to,
        withReanalysis: value.withReanalysis,
        steps: value.steps,
        startedAt: value.startedAt,
        updatedAt: value.updatedAt,
        finished: value.finished,
        requestedBy: value.requestedBy,
    };
}

/** Сценарии порталов в Redis: неделя после последнего тика. */
@Injectable()
export class AiRefreshStore {
    constructor(private readonly redis: RedisService) {}

    async read(domain: string): Promise<AiRefreshScenario | null> {
        return parseAiRefreshScenario(
            await this.redis.getClient().get(aiRefreshKey(domain)),
        );
    }

    async write(scenario: AiRefreshScenario): Promise<void> {
        await this.redis
            .getClient()
            .set(
                aiRefreshKey(scenario.domain),
                JSON.stringify(scenario),
                'EX',
                AI_REFRESH_DEFAULTS.stateTtlSeconds,
            );
    }
}
