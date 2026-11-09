import { CronJobInfo, CronJobPortal, CronJobsRoster } from '@lib/core/schedule';
import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingDescriptor,
    PortalAppSettingsRecord,
} from '@lib/portal-lib/store/app-settings';
import { PortalAiSettingsWithDomain } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.types';

/**
 * Сведения о кронах event-sales для стартового отчёта: что делает крон и
 * на каких порталах включён (в том числе все подстраховки).
 *
 * Таблицы повторяют критерии самих планировщиков — каждый читает свой
 * флаг из тех же настроек портала. Расхождение с реестром Nest видно в
 * отчёте: крон без строки здесь печатается как «привязка к порталам не
 * описана», строка без крона — предупреждением внизу.
 */

const SETTINGS = PORTAL_APP_SETTINGS_SCHEMA[EnumPortalAppCode.eventSales];

type BooleanSetting = PortalAppSettingDescriptor<'boolean', boolean>;

/** Значение флага на портале: сохранённое, иначе дефолт кода. */
const flag = (
    row: PortalAppSettingsRecord,
    setting: BooleanSetting,
): boolean => {
    const value = row.settings[setting.code];
    return typeof value === 'boolean' ? value : setting.default;
};

type PortalNote<T> = (portal: T) => string | undefined;

/** Крон, включаемый флагом в настройках event-sales портала (portal_app_settings). */
interface AppSettingsCron {
    readonly name: string;
    readonly purpose: string;
    readonly enabled: BooleanSetting;
    /** Пометка режима портала; undefined — без пометки. */
    readonly note?: PortalNote<PortalAppSettingsRecord>;
}

const markedWhen =
    (
        setting: BooleanSetting,
        label: string,
    ): PortalNote<PortalAppSettingsRecord> =>
    row =>
        flag(row, setting) ? label : undefined;

/** Второй способ подстраховки ХО — поиск по дате звонка — со своим холостым ходом. */
const xoOrphanNote: PortalNote<PortalAppSettingsRecord> = row => {
    if (!flag(row, SETTINGS.xoRescueOrphanEnabled)) return undefined;
    return flag(row, SETTINGS.xoRescueOrphanDryRun)
        ? 'по дате звонка — только в лог'
        : 'и по дате звонка';
};

const APP_SETTINGS_CRONS: readonly AppSettingsCron[] = [
    {
        name: 'xo-dispatch-rescue',
        purpose: 'подстраховка ХО: досылка упавших хуков',
        enabled: SETTINGS.xoRescueEnabled,
        note: xoOrphanNote,
    },
    {
        name: 'lead-intake-rescue',
        purpose: 'страховка входа заявок',
        enabled: SETTINGS.leadIntakeRescueEnabled,
    },
    {
        name: 'lead-request-sla',
        purpose: 'SLA принятия заявок',
        enabled: SETTINGS.leadIntakeSlaEnabled,
    },
    {
        name: 'tmc-approval-rescue',
        purpose: 'подстраховка согласования заявок ТМЦ',
        enabled: SETTINGS.tmcApprovalRescueEnabled,
        note: markedWhen(SETTINGS.tmcApprovalRescueDryRun, 'холостой ход'),
    },
    {
        name: 'reject-revive',
        purpose: 'реанимация отказников',
        enabled: SETTINGS.rejectReviveEnabled,
    },
    {
        name: 'event-sales-deal-audit',
        purpose: 'аудит сделок',
        enabled: SETTINGS.dealAuditEnabled,
        note: markedWhen(SETTINGS.dealAuditDryRun, 'только считать'),
    },
    {
        name: 'event-sales-duplicate-report',
        purpose: 'отчёт по дублям сделок',
        enabled: SETTINGS.duplicateReportEnabled,
        note: markedWhen(SETTINGS.duplicateReportCountOnly, 'только считать'),
    },
];

/**
 * Крон AI-конвейера звонков: порталы с enabled=true в portal_ai_settings,
 * у части кронов — ещё свой тумблер там же (дефолты как в
 * CallReportSettingsService: ревизор и сверка презентаций выключены,
 * глубокий разбор включён).
 */
interface AiSettingsCron {
    readonly name: string;
    readonly purpose: string;
    readonly include?: (portal: PortalAiSettingsWithDomain) => boolean;
    readonly note?: PortalNote<PortalAiSettingsWithDomain>;
}

const presentationAuditNote: PortalNote<
    PortalAiSettingsWithDomain
> = portal => {
    const parts = [
        portal.presentationAuditEnabled === true ? 'презентации' : null,
        portal.deepAnalysisEnabled !== false ? 'причины отказа' : null,
    ].filter((part): part is string => part !== null);
    return parts.length ? parts.join(', ') : 'нечего сверять';
};

const AI_SETTINGS_CRONS: readonly AiSettingsCron[] = [
    { name: 'call-report-scan', purpose: 'разбор звонков: скан телефонии' },
    { name: 'call-report-catch-up', purpose: 'разбор звонков: вечерний догон' },
    {
        name: 'call-report-smart-backfill',
        purpose: 'разбор звонков: дописывание карточек смарта',
    },
    {
        name: 'call-report-weekly',
        purpose: 'недельный Excel-отчёт по звонкам',
        include: portal => portal.weeklyReportEnabled === true,
    },
    {
        name: 'call-revision',
        purpose: 'ночной ревизор разборов',
        include: portal => portal.revisorEnabled === true,
    },
    {
        name: 'presentation-audit',
        purpose: 'утренняя сверка презентаций и причин отказа',
        note: presentationAuditNote,
    },
];

const toPortal = <T extends { domain: string }>(
    portal: T,
    note?: PortalNote<T>,
): CronJobPortal => {
    const text = note?.(portal);
    return text
        ? { domain: portal.domain, note: text }
        : { domain: portal.domain };
};

const byDomain = (a: CronJobPortal, b: CronJobPortal): number =>
    a.domain.localeCompare(b.domain);

/** Таблицы выше + строки настроек → сведения для отчёта. */
export const buildEventSalesCronRoster = (
    rows: readonly PortalAppSettingsRecord[],
    aiPortals: readonly PortalAiSettingsWithDomain[],
): CronJobsRoster => {
    const roster = new Map<string, CronJobInfo>();
    for (const cron of APP_SETTINGS_CRONS) {
        roster.set(cron.name, {
            purpose: cron.purpose,
            portals: rows
                .filter(row => flag(row, cron.enabled))
                .map(row => toPortal(row, cron.note))
                .sort(byDomain),
        });
    }
    for (const cron of AI_SETTINGS_CRONS) {
        roster.set(cron.name, {
            purpose: cron.purpose,
            portals: aiPortals
                .filter(
                    portal =>
                        portal.enabled === true &&
                        (cron.include?.(portal) ?? true),
                )
                .map(portal => toPortal(portal, cron.note))
                .sort(byDomain),
        });
    }
    return roster;
};

/** Имена кронов event-sales, описанных в таблицах — для теста полноты. */
export const EVENT_SALES_DESCRIBED_CRONS: readonly string[] = [
    ...APP_SETTINGS_CRONS,
    ...AI_SETTINGS_CRONS,
].map(cron => cron.name);
