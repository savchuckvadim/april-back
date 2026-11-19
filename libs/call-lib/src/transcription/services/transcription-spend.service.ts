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
import {
    spendMonthDays,
    submissionKeys,
    withSubmissions,
    type YandexSubmissionDay,
} from '../lib/yandex-submission-stats.util';
import { YandexSubmissionStatsRepository } from '../repository/yandex-submission-stats.repository';

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
 * Рядом со звонками — отправки в Яндекс из счётчика стража (Redis): их
 * больше, чем звонков, — звонки уходили и оплачивались повторно.
 */
@Injectable()
export class TranscriptionSpendService {
    private readonly logger = new Logger(TranscriptionSpendService.name);

    constructor(
        private readonly repository: TranscriptionSpendRepository,
        private readonly price: YandexSttPriceService,
        private readonly portalAiSettings: PortalAiSettingsService,
        private readonly submissionStats: YandexSubmissionStatsRepository,
    ) {}

    /** Сводка по всем порталам за месяц: самые дорогие первыми. */
    async summary(
        month: string | undefined,
        now = new Date(),
    ): Promise<TranscriptionSpendSummaryDto> {
        const range = spendMonthRange(month, now);
        const days = spendMonthDays(range);
        const [kopecks, rows, budgets, sent] = await Promise.all([
            this.price.kopecksPerMinute(),
            this.repository.aggregate(range, 'domain'),
            this.budgets(),
            this.submissions(days),
        ]);
        const groups = spendGroups(rows, row => row.key, kopecks);
        // Портал мог только отправлять в Яндекс, не получив ни одной
        // расшифровки, — его строка тоже нужна.
        const domains = [
            ...new Set([...groups.keys(), ...submissionKeys(sent, days)]),
        ];
        const ids = await this.repository.portalIds(domains.filter(Boolean));
        const portals: TranscriptionSpendPortalRowDto[] = domains.map(
            domain => ({
                domain,
                portalId: ids.get(domain) ?? null,
                yandexBudgetRub: budgets.get(domain) ?? null,
                totals: withSubmissions(
                    groups.get(domain)?.totals ?? spendTotals([]),
                    sent,
                    days,
                    domain,
                ),
                providers: groups.get(domain)?.providers ?? [],
            }),
        );
        portals.sort(
            (a, b) =>
                b.totals.rub - a.totals.rub || b.totals.calls - a.totals.calls,
        );
        return {
            month: range.month,
            kopecksPerMinute: kopecks,
            totals: withSubmissions(
                spendTotals(spendByProvider(rows, kopecks)),
                sent,
                days,
            ),
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
        const monthDays = spendMonthDays(range);
        const previousDays = spendMonthDays(previous);
        const [
            kopecks,
            providerRows,
            previousRows,
            dayRows,
            userRows,
            calls,
            yandexBudgetRub,
            sent,
        ] = await Promise.all([
            this.price.kopecksPerMinute(),
            this.repository.aggregate(slice, 'domain'),
            this.repository.aggregate({ ...previous, domain }, 'domain'),
            this.repository.aggregate(slice, 'day'),
            this.repository.aggregate(slice, 'user'),
            this.repository.longestYandexCalls(slice, SPEND_TOP_CALLS),
            this.budgetOf(domain),
            this.submissions([...previousDays, ...monthDays]),
        ]);

        const providers = spendByProvider(providerRows, kopecks);
        const dayGroups = spendGroups(dayRows, row => row.key, kopecks);
        const days = [
            ...new Set([
                ...dayGroups.keys(),
                ...submissionKeys(sent, monthDays, domain),
            ]),
        ]
            .sort((a, b) => a.localeCompare(b))
            .map(day => ({
                day,
                totals: withSubmissions(
                    dayGroups.get(day)?.totals ?? spendTotals([]),
                    sent,
                    [day],
                    domain,
                ),
            }));

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
            totals: withSubmissions(
                spendTotals(providers),
                sent,
                monthDays,
                domain,
            ),
            previousTotals: withSubmissions(
                spendTotals(spendByProvider(previousRows, kopecks)),
                sent,
                previousDays,
                domain,
            ),
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
     * Счётчик отправок в Яндекс по дням. Сбой Redis страницу не роняет —
     * отправки просто не показаны (null).
     */
    private async submissions(
        days: readonly string[],
    ): Promise<Map<string, YandexSubmissionDay>> {
        try {
            return await this.submissionStats.byDays(days);
        } catch (error) {
            this.logger.warn(
                `Счётчик отправок в Яндекс не прочитан: ${(error as Error).message}`,
            );
            return new Map();
        }
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
