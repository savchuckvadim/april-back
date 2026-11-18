import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { AiService, pickActiveRecord, type AiEntityDto } from '@lib/call-lib';
import {
    AI_ANALYTICS_SNAPSHOT_APP,
    AI_ANALYTICS_SNAPSHOT_PROVIDER,
    AI_ANALYTICS_SNAPSHOT_STATUS,
    DIGEST_CALC_VERSION,
    DIGEST_SNAPSHOT_TYPE,
    isManagerDigestCard,
    parseSnapshotUserResult,
    type DigestPeriodKind,
    type ManagerDigestCard,
    type SnapshotUserResult,
} from '@lib/sales-ai-analytics';
import type { PeriodDigestSaved } from '../lib/period-digest-summary';

/**
 * Карточки итогов периода в ais: тип по виду периода, activity_id — ключ
 * периода, user_id — менеджер, нагрузка — карточка в конверте снапшотов
 * AI-аналитики. Пересчёт того же периода обновляет запись менеджера на
 * месте; совпавшая карточка (та же подпись) не перезаписывается.
 *
 * `@Injectable` без bitrix-состояния: только AiService.
 */
@Injectable()
export class PeriodDigestCardStore {
    constructor(private readonly aiService: AiService) {}

    /** Карточки периода по менеджеру; чужие и битые записи пропускаются. */
    async read(
        domain: string,
        kind: DigestPeriodKind,
        periodKey: string,
    ): Promise<Map<string, ManagerDigestCard>> {
        const cards = new Map<string, ManagerDigestCard>();
        for (const record of (
            await this.records(domain, kind, periodKey)
        ).values()) {
            const envelope = parseSnapshotUserResult(record.user_result);
            if (envelope && isManagerDigestCard(envelope.payload)) {
                cards.set(envelope.payload.managerId, envelope.payload);
            }
        }
        return cards;
    }

    /** Записать карточки периода: новые, обновлённые и совпавшие. */
    async save(
        domain: string,
        cards: readonly ManagerDigestCard[],
        now: Date,
    ): Promise<PeriodDigestSaved> {
        const saved = { created: 0, updated: 0, unchanged: 0 };
        const first = cards[0];
        if (!first) return saved;
        const { kind, key } = first.period;
        const existing = await this.records(domain, kind, key);
        for (const card of cards) {
            const inputsHash = digestCardHash(card);
            const record = existing.get(card.managerId);
            const envelope = record
                ? parseSnapshotUserResult(record.user_result)
                : null;
            if (envelope?.inputsHash === inputsHash) {
                saved.unchanged += 1;
                continue;
            }
            const userResult = toJson({
                managerId: card.managerId,
                paramsVersion: '',
                inputsHash,
                generatedAt: now.toISOString(),
                payload: card,
            });
            if (record) {
                await this.aiService.update(record.id, {
                    user_result: userResult,
                    model: DIGEST_CALC_VERSION,
                });
                saved.updated += 1;
                continue;
            }
            await this.aiService.create({
                provider: AI_ANALYTICS_SNAPSHOT_PROVIDER,
                app: AI_ANALYTICS_SNAPSHOT_APP,
                model: DIGEST_CALC_VERSION,
                type: DIGEST_SNAPSHOT_TYPE[kind],
                status: AI_ANALYTICS_SNAPSHOT_STATUS.done,
                activity_id: key,
                user_id: Number(card.managerId),
                domain,
                user_result: userResult,
            });
            saved.created += 1;
        }
        return saved;
    }

    /** Действующая запись периода по менеджеру (user_id). */
    private async records(
        domain: string,
        kind: DigestPeriodKind,
        periodKey: string,
    ): Promise<Map<string, AiEntityDto>> {
        const all = await this.aiService.findByDomainTypeKeys(
            domain,
            DIGEST_SNAPSHOT_TYPE[kind],
            { activityIds: [periodKey] },
        );
        const byManager = new Map<string, AiEntityDto[]>();
        for (const record of all) {
            const id = String(record.user_id);
            byManager.set(id, [...(byManager.get(id) ?? []), record]);
        }
        const active = new Map<string, AiEntityDto>();
        for (const [id, records] of byManager) {
            const record = pickActiveRecord(records);
            if (record) active.set(id, record);
        }
        return active;
    }
}

/** Подпись карточки: совпала — запись не трогается. */
export const digestCardHash = (card: ManagerDigestCard): string =>
    createHash('sha256')
        .update(JSON.stringify(card))
        .digest('hex')
        .slice(0, 16);

const toJson = (envelope: SnapshotUserResult<ManagerDigestCard>) =>
    JSON.parse(JSON.stringify(envelope)) as Prisma.JsonValue;
