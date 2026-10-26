import {
    EnumPortalAppCode,
    parseUserIds,
    PortalAppSettingsValues,
} from '@lib/portal-lib/store/app-settings';
import { SupportWaitThresholds } from '../domain/support-dialog.types';

/** Параметры монитора портала линии — разобранные настройки. */
export interface SupportMonitorOptions {
    enabled: boolean;
    /** Только считать: разбор и журнал, без оповещений. */
    dryRun: boolean;
    /** CONFIG_ID линии; 0 — все линии портала. */
    lineId: number;
    /** Портал колокольчика (уже с подставленным порталом линии). */
    notifyDomain: string;
    notifyUserIds: number[];
    thresholds: SupportWaitThresholds;
    pollMinutes: number;
    telegramEnabled: boolean;
}

export const SUPPORT_POLL_MINUTES = { min: 1, max: 30, fallback: 3 } as const;
export const SUPPORT_REMIND_FALLBACK_MINUTES = 10;
export const SUPPORT_ESCALATE_FALLBACK_MINUTES = 30;

const positiveInt = (raw: unknown, fallback: number): number => {
    const value = Math.floor(Number(raw));
    return Number.isFinite(value) && value > 0 ? value : fallback;
};

/** `https://April-Garant.bitrix24.ru/` → `april-garant.bitrix24.ru`. */
export function normalizeSupportDomain(raw: string | null | undefined): string {
    return (raw ?? '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '');
}

type PortalValues = PortalAppSettingsValues<EnumPortalAppCode.portal>;

/**
 * Настройки портала → параметры монитора. Одно место правил «что считать
 * пустым и что дефолтом» для крона и предпросмотра в админке.
 * Срочный повтор всегда позже напоминания: иначе напоминание не
 * приходило бы никогда (сразу срочное).
 */
export function toSupportMonitorOptions(
    lineDomain: string,
    values: Pick<
        PortalValues,
        | 'supportMonitorEnabled'
        | 'supportMonitorDryRun'
        | 'supportMonitorLineId'
        | 'supportMonitorNotifyDomain'
        | 'supportMonitorNotifyUserIds'
        | 'supportMonitorRemindMinutes'
        | 'supportMonitorEscalateMinutes'
        | 'supportMonitorPollMinutes'
        | 'supportMonitorTelegramEnabled'
    >,
): SupportMonitorOptions {
    const remindMinutes = positiveInt(
        values.supportMonitorRemindMinutes,
        SUPPORT_REMIND_FALLBACK_MINUTES,
    );
    const escalateMinutes = Math.max(
        remindMinutes + 1,
        positiveInt(
            values.supportMonitorEscalateMinutes,
            SUPPORT_ESCALATE_FALLBACK_MINUTES,
        ),
    );
    const pollMinutes = Math.min(
        SUPPORT_POLL_MINUTES.max,
        Math.max(
            SUPPORT_POLL_MINUTES.min,
            positiveInt(
                values.supportMonitorPollMinutes,
                SUPPORT_POLL_MINUTES.fallback,
            ),
        ),
    );
    const lineId = Math.floor(Number(values.supportMonitorLineId));

    return {
        enabled: Boolean(values.supportMonitorEnabled),
        dryRun: Boolean(values.supportMonitorDryRun),
        lineId: Number.isFinite(lineId) && lineId > 0 ? lineId : 0,
        notifyDomain:
            normalizeSupportDomain(values.supportMonitorNotifyDomain) ||
            normalizeSupportDomain(lineDomain),
        notifyUserIds: parseUserIds(values.supportMonitorNotifyUserIds),
        thresholds: { remindMinutes, escalateMinutes },
        pollMinutes,
        telegramEnabled: Boolean(values.supportMonitorTelegramEnabled),
    };
}
