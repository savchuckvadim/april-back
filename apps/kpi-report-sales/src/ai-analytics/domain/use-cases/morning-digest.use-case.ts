import { Injectable } from '@nestjs/common';
import {
    buildMorningDigest,
    DigestItem,
    previousWorkday,
    toPortalDate,
} from '@lib/sales-ai-analytics';
import { CallsLoader } from '../loaders/calls.loader';
import { toAgendaRow } from '../loaders/lite-row.mapper';
import { portalRangeUtc } from '../loaders/period.util';
import { SettingsLoader } from '../loaders/settings.loader';

export interface MorningDigestOptions {
    now?: Date;
}

export interface MorningDigestResult {
    /** Вчерашний рабочий день (YYYY-MM-DD, TZ портала), за который собран разбор. */
    day: string;
    /** managerId → 1–3 звонка с худшими разделами и фразами «как можно было». */
    byManager: Map<string, DigestItem[]>;
}

/**
 * Утренний разбор менеджерам (план, 6.2 / Фаза 1a): по каждому менеджеру
 * 1–3 его звонка за вчерашний рабочий день с худшими разделами и до 3
 * фраз alternatives (buildMorningDigest). Отправка — шаг 2 (delivery +
 * scheduler); здесь только сборка.
 */
@Injectable()
export class MorningDigestUseCase {
    constructor(
        private readonly calls: CallsLoader,
        private readonly settings: SettingsLoader,
    ) {}

    async execute(
        domain: string,
        options: MorningDigestOptions = {},
    ): Promise<MorningDigestResult> {
        const now = options.now ?? new Date();
        const { calendar } = await this.settings.load(domain);
        const day = previousWorkday(
            toPortalDate(now, calendar.timeZone),
            calendar,
        );
        const { from, to } = portalRangeUtc(day, day, calendar.timeZone);
        const rows = (await this.calls.loadLite(domain, from, to)).map(
            toAgendaRow,
        );

        const managerIds = [
            ...new Set(
                rows.flatMap(row => (row.managerId ? [row.managerId] : [])),
            ),
        ].sort();
        const byManager = new Map<string, DigestItem[]>();
        for (const managerId of managerIds) {
            const items = buildMorningDigest(rows, managerId);
            if (items.length) byManager.set(managerId, items);
        }
        return { day, byManager };
    }
}
