import { Injectable } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import { getErrorString } from '@/shared/lib/utils/get-error-string.util';
import {
    buildDealAuditFindingsKey,
    DEAL_AUDIT_FINDINGS_TTL_SEC,
    DEAL_AUDIT_FLAG,
    DEAL_AUDIT_STATUS,
    DealAuditFlagCode,
    DealAuditStatusCode,
} from '../constants/deal-audit.const';
import { isForgotten } from '../lib/deal-audit-rules';
import { DealAuditVerdict } from '../types/deal-audit.types';

/** Находка аудита по сделке — то, что читает сводка «Движение сделок». */
export interface DealAuditFinding {
    readonly status: DealAuditStatusCode;
    readonly flags: readonly DealAuditFlagCode[];
    /** Дней без активности; null — активность неизвестна. */
    readonly idleDays: number | null;
    /** Дней просрочки самой старой задачи; 0 — просрочки нет. */
    readonly overdueDays: number;
    /** Момент прогона аудита, ISO. */
    readonly at: string;
}

/** Полей в одной команде HSET/HDEL: тысячи сделок не уходят одним пакетом. */
const FIELDS_PER_COMMAND = 500;

const STATUSES: ReadonlySet<string> = new Set(Object.values(DEAL_AUDIT_STATUS));
const FLAGS: ReadonlySet<string> = new Set(Object.values(DEAL_AUDIT_FLAG));

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Строка хеша → находка; битая или чужая — null, незнакомые признаки — мимо. */
export function decodeDealAuditFinding(raw: string): DealAuditFinding | null {
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return null;
    }
    if (
        !isRecord(value) ||
        typeof value.status !== 'string' ||
        !STATUSES.has(value.status) ||
        typeof value.at !== 'string' ||
        !Array.isArray(value.flags)
    ) {
        return null;
    }
    return {
        status: value.status as DealAuditStatusCode,
        flags: value.flags.filter(
            (flag): flag is DealAuditFlagCode =>
                typeof flag === 'string' && FLAGS.has(flag),
        ),
        idleDays: typeof value.idleDays === 'number' ? value.idleDays : null,
        overdueDays:
            typeof value.overdueDays === 'number' ? value.overdueDays : 0,
        at: value.at,
    };
}

const chunks = <T>(items: readonly T[]): T[][] => {
    const result: T[][] = [];
    for (let start = 0; start < items.length; start += FIELDS_PER_COMMAND) {
        result.push(items.slice(start, start + FIELDS_PER_COMMAND));
    }
    return result;
};

/**
 * Находки аудита по сделкам — Redis-хеш `findings:{домен}` (поле — id
 * сделки), 35 суток, продлевается каждым прогоном (плановым и ручным).
 * Пишутся только забытые сделки; сделка, ставшая «нормой», из хеша
 * удаляется — иначе пометка висела бы до конца срока. Сделки вне выборки
 * прогона не трогаются: свежесть читатель меряет по `at`.
 *
 * Сбой Redis прогон аудита не роняет — предупреждение в итог.
 *
 * `@Injectable` без bitrix-состояния: только Redis.
 */
@Injectable()
export class DealAuditFindingsStore {
    constructor(private readonly redisService: RedisService) {}

    async save(
        domain: string,
        verdicts: readonly DealAuditVerdict[],
        at: string,
        warnings: string[],
    ): Promise<void> {
        try {
            const redis = this.redisService.getClient();
            const key = buildDealAuditFindingsKey(domain);
            const forgotten = verdicts.filter(isForgotten);
            const normal = verdicts
                .filter(verdict => !isForgotten(verdict))
                .map(verdict => String(verdict.dealId));
            for (const part of chunks(forgotten)) {
                const fields: Record<string, string> = {};
                for (const verdict of part) {
                    fields[String(verdict.dealId)] = encode(verdict, at);
                }
                await redis.hset(key, fields);
            }
            for (const part of chunks(normal)) {
                await redis.hdel(key, ...part);
            }
            if (forgotten.length > 0) {
                await redis.expire(key, DEAL_AUDIT_FINDINGS_TTL_SEC);
            }
        } catch (error) {
            warnings.push(
                `находки аудита для сводки «Движение сделок» не сохранены: ${getErrorString(error)}`,
            );
        }
    }

    /** Находки портала по сделкам; битые записи пропускаются. */
    async load(domain: string): Promise<Map<string, DealAuditFinding>> {
        const raw = await this.redisService
            .getClient()
            .hgetall(buildDealAuditFindingsKey(domain));
        const findings = new Map<string, DealAuditFinding>();
        for (const [dealId, value] of Object.entries(raw ?? {})) {
            const finding = decodeDealAuditFinding(value);
            if (finding !== null) findings.set(dealId, finding);
        }
        return findings;
    }
}

const encode = (verdict: DealAuditVerdict, at: string): string =>
    JSON.stringify({
        status: verdict.status,
        flags: verdict.flags,
        idleDays: verdict.idleDays,
        overdueDays: verdict.overdueDays,
        at,
    } satisfies DealAuditFinding);
