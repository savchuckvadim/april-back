import { Injectable } from '@nestjs/common';
import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingsService,
    toDealMovementDigestMode,
    toDealMovementDigestWeekday,
    toDealMovementNoteKind,
    type PortalAppSettingsValues,
} from '@lib/portal-lib/store/app-settings';
import { DEAL_MOVEMENT_DEFAULTS } from '@lib/sales-ai-analytics';
import { DEAL_MOVEMENT_SETTING_DEFAULTS } from '../constants/deal-movement.const';
import type { DealMovementOptions } from '../types/deal-movement.types';

/** Целое ≥ 1; ноль, отрицательное и мусор — значение по умолчанию. */
const positiveInt = (raw: unknown, fallback: number): number => {
    const value = Math.floor(Number(raw));
    return Number.isFinite(value) && value >= 1 ? value : fallback;
};

/** Целое ≥ 0 (ноль — «ни одной»); пусто, отрицательное и мусор — по умолчанию. */
const nonNegativeInt = (raw: unknown, fallback: number): number => {
    if (raw === null || raw === undefined || raw === '') return fallback;
    const value = Math.floor(Number(raw));
    return Number.isFinite(value) && value >= 0 ? value : fallback;
};

type EventSalesSettings = PortalAppSettingsValues<EnumPortalAppCode.eventSales>;

/**
 * Настройки портала → параметры счёта. Чистая функция: пустое и мусор —
 * значения по умолчанию; окно звонков не короче окна событий, иначе
 * «звонков за окно нет» считалось бы по неполным данным. Тот же срок —
 * у чтения звонков и дел Битрикса («ни звонков, ни дел N дней»).
 */
export function toDealMovementOptions(
    settings: Pick<
        EventSalesSettings,
        | 'dealMovementWindowDays'
        | 'dealMovementStuckDays'
        | 'dealMovementAgreedStillDays'
        | 'dealMovementCallsLookbackDays'
        | 'dealMovementMaxDeals'
        | 'dealMovementWriteNotes'
        | 'dealMovementNoteKind'
        | 'dealMovementMaxNotes'
        | 'dealMovementMaxTexts'
    > &
        Partial<
            Pick<
                EventSalesSettings,
                | 'dealMovementDigestEnabled'
                | 'dealMovementDigestMode'
                | 'dealMovementDigestWeekday'
                | 'dealMovementDigestTop'
            >
        >,
): DealMovementOptions {
    const defaults = DEAL_MOVEMENT_SETTING_DEFAULTS;
    const windowDays = positiveInt(
        settings.dealMovementWindowDays,
        defaults.windowDays,
    );
    const callsLookbackDays = Math.max(
        windowDays,
        positiveInt(
            settings.dealMovementCallsLookbackDays,
            defaults.callsLookbackDays,
        ),
    );
    return {
        thresholds: {
            ...DEAL_MOVEMENT_DEFAULTS,
            windowDays,
            stuckDefaultDays: positiveInt(
                settings.dealMovementStuckDays,
                defaults.stuckDays,
            ),
            agreedStillDays: positiveInt(
                settings.dealMovementAgreedStillDays,
                defaults.agreedStillDays,
            ),
            workLookbackDays: callsLookbackDays,
        },
        callsLookbackDays,
        maxDeals: positiveInt(settings.dealMovementMaxDeals, defaults.maxDeals),
        notes: {
            // Только явное «да»: всё новое по умолчанию выключено.
            write: settings.dealMovementWriteNotes === true,
            kind: toDealMovementNoteKind(settings.dealMovementNoteKind),
            maxNotes: nonNegativeInt(
                settings.dealMovementMaxNotes,
                defaults.maxNotes,
            ),
            maxTexts: nonNegativeInt(
                settings.dealMovementMaxTexts,
                defaults.maxTexts,
            ),
        },
        digest: {
            // Только явное «да»: сводка руководителям по умолчанию выключена.
            enabled: settings.dealMovementDigestEnabled === true,
            mode: toDealMovementDigestMode(settings.dealMovementDigestMode),
            weekday: toDealMovementDigestWeekday(
                settings.dealMovementDigestWeekday,
            ),
            top: positiveInt(
                settings.dealMovementDigestTop,
                defaults.digestTop,
            ),
        },
    };
}

/**
 * Настройки движения сделок из «Настроек приложений» event-sales (группа
 * «Движение сделок»). Один сервис для крона и ручного прогона — правила
 * «что пусто, что по умолчанию» одни.
 */
@Injectable()
export class DealMovementSettingsService {
    constructor(private readonly appSettings: PortalAppSettingsService) {}

    async resolve(domain: string): Promise<DealMovementOptions> {
        return toDealMovementOptions(
            await this.appSettings.resolve(
                domain,
                EnumPortalAppCode.eventSales,
            ),
        );
    }

    /** Порталы с включённым движением сделок (ростер крона). */
    async enabledDomains(): Promise<string[]> {
        const rows = await this.appSettings.listByAppCode(
            EnumPortalAppCode.eventSales,
        );
        const enabledKey =
            PORTAL_APP_SETTINGS_SCHEMA[EnumPortalAppCode.eventSales]
                .dealMovementEnabled.code;
        return rows
            .filter(row => row.settings[enabledKey] === true)
            .map(row => row.domain);
    }
}
