import { Injectable } from '@nestjs/common';
import { dealMovementDigestPeriodDays } from '@lib/portal-lib/store/app-settings';
import {
    DEAL_MOVEMENT_DIGEST_SKIP,
    type DealMovementDigestSkip,
    type DealMovementStateEntry,
} from '@lib/sales-ai-analytics';
import { getErrorString } from '@/shared/lib/utils/get-error-string.util';
import {
    dealMovementPeriodFromDay,
    dealMovementPeriodSinceMs,
    isDealMovementPeriodDigestDue,
} from '../lib/deal-movement-digest.schedule';
import type { DealMovementDigestOptions } from '../types/deal-movement.types';
import { DealMovementNightCounters } from './deal-movement-night-counters';
import { DealMovementStateStore } from './deal-movement-state.store';

/** Сводка за период этой ночью: длина и с какого момента «что изменилось». */
export interface DealMovementPeriodWindow {
    readonly periodDays: number;
    /** Момент прошлой сводки (или начала периода), мс. */
    readonly sinceMs: number;
    /** День портала начала периода 'YYYY-MM-DD' — для заголовка. */
    readonly fromDay: string;
}

/** Что решила отметка: слать (и какой сводкой) или почему нет. */
export type DealMovementDigestClaim =
    | {
          readonly skipped: null;
          /** Сводка за период; null — ежедневная. */
          readonly period: DealMovementPeriodWindow | null;
      }
    | { readonly skipped: DealMovementDigestSkip };

/**
 * Когда уходит сводка «Движение сделок» и что она помнит (20.11.2026):
 * - ежедневные режимы — один раз за день портала;
 * - «раз в неделю» / «раз в две недели» — в выбранный день недели и не
 *   чаще периода; отметка последней сводки — момент «что изменилось с
 *   прошлой сводки»;
 * - показанные напоминания «Давно без продвижения» — ступенью в состоянии
 *   сделки (каждая ступень — один раз).
 * Отметки — ДО рассылки: лучше потерять сводку при сбое, чем прислать её
 * дважды.
 *
 * `@Injectable` без bitrix-состояния: только Redis.
 */
@Injectable()
export class DealMovementDigestSchedule {
    constructor(
        private readonly counters: DealMovementNightCounters,
        private readonly stateStore: DealMovementStateStore,
    ) {}

    async claim(request: {
        readonly domain: string;
        /** День портала 'YYYY-MM-DD'. */
        readonly day: string;
        readonly now: Date;
        readonly options: Pick<DealMovementDigestOptions, 'mode' | 'weekday'>;
    }): Promise<DealMovementDigestClaim> {
        const { domain, day, options } = request;
        const periodDays = dealMovementDigestPeriodDays(options.mode);
        if (periodDays === null) {
            return (await this.counters.claimDigest(domain, day))
                ? { skipped: null, period: null }
                : { skipped: DEAL_MOVEMENT_DIGEST_SKIP.alreadySent };
        }
        const last = await this.counters.periodDigestMark(domain);
        if (
            !isDealMovementPeriodDigestDue({
                day,
                weekday: options.weekday,
                periodDays,
                last,
            })
        ) {
            return { skipped: DEAL_MOVEMENT_DIGEST_SKIP.notDue };
        }
        await this.counters.markPeriodDigest(domain, {
            day,
            at: request.now.toISOString(),
        });
        return {
            skipped: null,
            period: {
                periodDays,
                sinceMs: dealMovementPeriodSinceMs(day, periodDays, last),
                fromDay: dealMovementPeriodFromDay(day, periodDays, last),
            },
        };
    }

    /**
     * Показанные напоминания — в состояние сделки: эта ступень больше не
     * напоминается. Не записалось — предупреждение (ступень придёт снова).
     */
    async markReminded(
        domain: string,
        state: ReadonlyMap<string, DealMovementStateEntry>,
        reminded: ReadonlyMap<string, number>,
        warnings: string[],
    ): Promise<void> {
        const entries = new Map<string, DealMovementStateEntry>();
        for (const [dealId, step] of reminded) {
            const entry = state.get(dealId);
            if (entry) entries.set(dealId, { ...entry, remindedStep: step });
        }
        if (entries.size === 0) return;
        try {
            await this.stateStore.saveEntries(domain, entries);
        } catch (error) {
            warnings.push(
                `напоминания сводки не запомнены — придут снова: ${getErrorString(error)}`,
            );
        }
    }
}
