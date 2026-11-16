import { Injectable, Logger } from '@nestjs/common';
import { PortalAiSettingsService } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.service';
import type {
    TranscriptionSpendPortalDto,
    TranscriptionSpendPortalRowDto,
    TranscriptionSpendSummaryDto,
    TranscriptionSpendUserDto,
} from '../dto/transcription-spend.dto';
import {
    spendByProvider,
    spendGroups,
    spendMonthRange,
    spendRub,
    spendTotals,
    YANDEX_MIN_BILLED_SEC,
    type SpendTotals,
} from '../lib/transcription-spend.util';
import {
    type SpendSlice,
    TranscriptionSpendRepository,
} from '../repository/transcription-spend.repository';
import { YandexSttPriceService } from './yandex-stt-price.service';

/** Сколько самых длинных звонков Яндекса показывать у портала. */
export const SPEND_TOP_CALLS = 20;
/** Сколько сотрудников показывать у портала. */
export const SPEND_TOP_USERS = 50;

/** Расход портала за месяц — для оповещения о лимите. */
export interface YandexMonthSpend {
    /** Месяц по Москве, YYYY-MM. */
    month: string;
    totals: SpendTotals;
}

/**
 * Расход на распознавание звонков: сводка по всем порталам и подробности
 * одного портала за месяц (админка), расход портала за текущий месяц
 * (оповещение о лимите). Только чтение базы; цена минуты Яндекса — из
 * «Настроек приложения», месячный лимит портала — из настроек AI портала.
 */
@Injectable()
export class TranscriptionSpendService {
    private readonly logger = new Logger(TranscriptionSpendService.name);

    constructor(
        private readonly repository: TranscriptionSpendRepository,
        private readonly price: YandexSttPriceService,
        private readonly portalAiSettings: PortalAiSettingsService,
    ) {}

    /** Сводка по всем порталам за месяц: самые дорогие первыми. */
    async summary(
        month: string | undefined,
        now = new Date(),
    ): Promise<TranscriptionSpendSummaryDto> {
        const range = spendMonthRange(month, now);
        const [kopecks, rows, budgets] = await Promise.all([
            this.price.kopecksPerMinute(),
            this.repository.aggregate(range, 'domain'),
            this.budgets(),
        ]);
        const groups = spendGroups(rows, row => row.key, kopecks);
        const ids = await this.repository.portalIds(
            [...groups.keys()].filter(Boolean),
        );
        const portals: TranscriptionSpendPortalRowDto[] = [...groups].map(
            ([domain, group]) => ({
                domain,
                portalId: ids.get(domain) ?? null,
                yandexBudgetRub: budgets.get(domain) ?? null,
                totals: group.totals,
                providers: group.providers,
            }),
        );
        portals.sort(
            (a, b) =>
                b.totals.rub - a.totals.rub || b.totals.calls - a.totals.calls,
        );
        return {
            month: range.month,
            kopecksPerMinute: kopecks,
            totals: spendTotals(spendByProvider(rows, kopecks)),
            portals,
        };
    }

    /** Подробности портала за месяц и итог прошлого месяца. */
    async portal(
        domain: string,
        month: string | undefined,
        now = new Date(),
    ): Promise<TranscriptionSpendPortalDto> {
        const range = spendMonthRange(month, now);
        const previous = spendMonthRange(range.month, now, -1);
        const slice: SpendSlice = { ...range, domain };
        const [
            kopecks,
            providerRows,
            previousRows,
            dayRows,
            userRows,
            calls,
            yandexBudgetRub,
        ] = await Promise.all([
            this.price.kopecksPerMinute(),
            this.repository.aggregate(slice, 'domain'),
            this.repository.aggregate({ ...previous, domain }, 'domain'),
            this.repository.aggregate(slice, 'day'),
            this.repository.aggregate(slice, 'user'),
            this.repository.longestYandexCalls(slice, SPEND_TOP_CALLS),
            this.budgetOf(domain),
        ]);

        const providers = spendByProvider(providerRows, kopecks);
        const days = [...spendGroups(dayRows, row => row.key, kopecks)]
            .map(([day, group]) => ({ day, totals: group.totals }))
            .sort((a, b) => a.day.localeCompare(b.day));

        const names = new Map(userRows.map(row => [row.key, row.label]));
        const users: TranscriptionSpendUserDto[] = [
            ...spendGroups(userRows, row => row.key, kopecks),
        ]
            .map(([userId, group]) => ({
                userId: userId || null,
                userName: names.get(userId) ?? null,
                totals: group.totals,
            }))
            .sort(
                (a, b) =>
                    b.totals.rub - a.totals.rub ||
                    b.totals.minutes - a.totals.minutes,
            )
            .slice(0, SPEND_TOP_USERS);

        return {
            month: range.month,
            domain,
            kopecksPerMinute: kopecks,
            yandexBudgetRub,
            totals: spendTotals(providers),
            previousTotals: spendTotals(spendByProvider(previousRows, kopecks)),
            providers,
            days,
            users,
            topCalls: calls.map(call => ({
                ...call,
                rub: spendRub(
                    Math.max(call.durationSec, YANDEX_MIN_BILLED_SEC),
                    kopecks,
                ),
            })),
        };
    }

    /** Расход портала за месяц, в который попадает `now` (по Москве). */
    async yandexMonth(
        domain: string,
        now = new Date(),
    ): Promise<YandexMonthSpend> {
        const range = spendMonthRange(undefined, now);
        const [kopecks, rows] = await Promise.all([
            this.price.kopecksPerMinute(),
            this.repository.aggregate({ ...range, domain }, 'domain'),
        ]);
        return {
            month: range.month,
            totals: spendTotals(spendByProvider(rows, kopecks)),
        };
    }

    /**
     * Месячные лимиты Яндекса порталов с включённым разбором: домен → рубли.
     * Сбой чтения страницу расхода не роняет — лимиты просто не показаны.
     */
    private async budgets(): Promise<Map<string, number>> {
        try {
            const portals = await this.portalAiSettings.findEnabled();
            return new Map(
                portals.flatMap(portal =>
                    portal.yandexMonthlyBudgetRub
                        ? [[portal.domain, portal.yandexMonthlyBudgetRub]]
                        : [],
                ),
            );
        } catch (error) {
            this.logger.warn(
                `Лимиты Яндекса порталов не прочитаны: ${(error as Error).message}`,
            );
            return new Map();
        }
    }

    /** Месячный лимит Яндекса портала; не задан или не прочитан — null. */
    private async budgetOf(domain: string): Promise<number | null> {
        try {
            const record = await this.portalAiSettings.getByDomain(domain);
            return record?.yandexMonthlyBudgetRub ?? null;
        } catch (error) {
            this.logger.warn(
                `Лимит Яндекса портала ${domain} не прочитан: ${(error as Error).message}`,
            );
            return null;
        }
    }
}
