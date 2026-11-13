import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    envOnlyReader,
    integerSettingValue,
    TRANSCRIPTION_SPEND_SETTING_RULES,
    VENDOR_SETTINGS_READER,
    type VendorSettingsReader,
} from '@lib/vendor-settings';
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
} from '../lib/transcription-spend.util';
import {
    type SpendSlice,
    TranscriptionSpendRepository,
} from '../repository/transcription-spend.repository';

/** Сколько самых длинных звонков Яндекса показывать у портала. */
export const SPEND_TOP_CALLS = 20;
/** Сколько сотрудников показывать у портала. */
export const SPEND_TOP_USERS = 50;

const PRICE_RULE =
    TRANSCRIPTION_SPEND_SETTING_RULES.YANDEX_STT_KOPECKS_PER_MINUTE;

/**
 * Расход на распознавание звонков для админки: сводка по всем порталам и
 * подробности одного портала за месяц. Только чтение базы; цена минуты
 * Яндекса — из «Настроек приложения» (YANDEX_STT_KOPECKS_PER_MINUTE).
 */
@Injectable()
export class TranscriptionSpendService {
    private readonly logger = new Logger(TranscriptionSpendService.name);
    private readonly settings: VendorSettingsReader;

    constructor(
        private readonly repository: TranscriptionSpendRepository,
        configService: ConfigService,
        @Optional()
        @Inject(VENDOR_SETTINGS_READER)
        settings?: VendorSettingsReader,
    ) {
        this.settings =
            settings ?? envOnlyReader(key => configService.get<string>(key));
    }

    /** Сводка по всем порталам за месяц: самые дорогие первыми. */
    async summary(
        month: string | undefined,
        now = new Date(),
    ): Promise<TranscriptionSpendSummaryDto> {
        const range = spendMonthRange(month, now);
        const [kopecks, rows] = await Promise.all([
            this.kopecksPerMinute(),
            this.repository.aggregate(range, 'domain'),
        ]);
        const groups = spendGroups(rows, row => row.key, kopecks);
        const ids = await this.repository.portalIds(
            [...groups.keys()].filter(Boolean),
        );
        const portals: TranscriptionSpendPortalRowDto[] = [...groups].map(
            ([domain, group]) => ({
                domain,
                portalId: ids.get(domain) ?? null,
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
        const [kopecks, providerRows, previousRows, dayRows, userRows, calls] =
            await Promise.all([
                this.kopecksPerMinute(),
                this.repository.aggregate(slice, 'domain'),
                this.repository.aggregate({ ...previous, domain }, 'domain'),
                this.repository.aggregate(slice, 'day'),
                this.repository.aggregate(slice, 'user'),
                this.repository.longestYandexCalls(slice, SPEND_TOP_CALLS),
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

    /** Цена минуты Яндекса; сбой чтения настроек — цена по умолчанию. */
    private async kopecksPerMinute(): Promise<number> {
        try {
            return integerSettingValue(
                await this.settings.get('YANDEX_STT_KOPECKS_PER_MINUTE'),
                PRICE_RULE,
            );
        } catch (error) {
            this.logger.warn(
                `Цена минуты Яндекса не прочиталась, считаю по умолчанию: ${(error as Error).message}`,
            );
            return PRICE_RULE.defaultValue;
        }
    }
}
