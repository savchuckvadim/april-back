import { Injectable } from '@nestjs/common';
import { shiftDate, toPortalDate, toScore10 } from '@lib/sales-ai-analytics';
import { AiAnalyticsCacheService } from '../cache/ai-analytics-cache.service';
import { normalizeUserId } from '../domain/access/perimeter.util';
import { CallsLoader } from '../domain/loaders/calls.loader';
import type { DatedLiteRow } from '../domain/loaders/lite-row.mapper';
import { portalRangeUtc } from '../domain/loaders/period.util';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import { DealMovementSnapshotsReader } from './deal-movement-snapshots.reader';
import {
    buildDealMovementPeriodKey,
    DEAL_MOVEMENT_CHECK_TAIL_DAYS,
    DEAL_MOVEMENT_TTL_SECONDS,
} from './deal-movement-vitrina.const';
import type {
    DealMovementCallPoint,
    DealMovementPeriodSource,
} from './deal-movement-vitrina.types';

/** Дни 'YYYY-MM-DD' от from до to включительно. */
export function daysBetween(from: string, to: string): string[] {
    const days: string[] = [];
    for (let day = from; day <= to; day = shiftDate(day, 1)) {
        days.push(day);
    }
    return days;
}

/**
 * До какого дня читать снимки: конец периода плюс хвост проверки
 * продвижения, но не дальше сегодня; конец периода — всегда.
 */
export function nightsReadEnd(to: string, today: string): string {
    const tail = shiftDate(to, DEAL_MOVEMENT_CHECK_TAIL_DAYS);
    const capped = tail < today ? tail : today;
    return capped > to ? capped : to;
}

/** Lite-строки звонков → звонки с продвижением 1–5. */
export function toDealMovementCallPoints(
    rows: readonly DatedLiteRow[],
): DealMovementCallPoint[] {
    return rows.flatMap(row => {
        const progress = row.methodology?.dealProgress;
        if (
            !row.analysisPresent ||
            typeof progress !== 'number' ||
            !Number.isInteger(progress) ||
            progress < 1 ||
            progress > 5
        ) {
            return [];
        }
        return [
            {
                transcriptionId: row.transcriptionId,
                managerId: normalizeUserId(row.managerId),
                at: row.callStartedAt.toISOString(),
                score: toScore10(row.score),
                progress,
            },
        ];
    });
}

/**
 * Выборка периода витрины «Движение сделок»: ночные снимки (ais) от
 * начала периода до конца + хвост проверки продвижения и разобранные
 * звонки периода с оценкой продвижения (lite-выборка из БД). Битрикс не
 * вызывается. Общая на портал и период, лежит только в Redis 5 минут —
 * периметр пользователя применяется уже к ней.
 *
 * `@Injectable` без bitrix-состояния.
 */
@Injectable()
export class DealMovementPeriodLoader {
    constructor(
        private readonly settings: SettingsLoader,
        private readonly calls: CallsLoader,
        private readonly snapshots: DealMovementSnapshotsReader,
        private readonly cache: AiAnalyticsCacheService,
    ) {}

    async load(
        domain: string,
        from: string,
        to: string,
        now: Date = new Date(),
    ): Promise<DealMovementPeriodSource> {
        const { value } = await this.cache.remember(
            buildDealMovementPeriodKey(domain, from, to),
            DEAL_MOVEMENT_TTL_SECONDS,
            () => this.build(domain, from, to, now),
            { volatile: true },
        );
        return value;
    }

    private async build(
        domain: string,
        from: string,
        to: string,
        now: Date,
    ): Promise<DealMovementPeriodSource> {
        const { calendar } = await this.settings.load(domain);
        const today = toPortalDate(now, calendar.timeZone);
        const range = portalRangeUtc(from, to, calendar.timeZone);
        const [nights, rows] = await Promise.all([
            this.snapshots.nights(
                domain,
                daysBetween(from, nightsReadEnd(to, today)),
            ),
            this.calls.loadLite(domain, range.from, range.to),
        ]);
        return {
            from,
            to,
            today,
            builtAt: now.toISOString(),
            nights,
            calls: toDealMovementCallPoints(rows),
        };
    }
}
