import {
    EnumPortalAppCode,
    parseUserIds,
    PortalAppSettingsValues,
} from '@lib/portal-lib/store/app-settings';

/** Настройки аудита, от которых зависит, уйдёт ли что-то по кнопке. */
export type DealAuditRunNowSettings = Pick<
    PortalAppSettingsValues<EnumPortalAppCode.eventSales>,
    | 'dealAuditEnabled'
    | 'dealAuditDryRun'
    | 'dealAuditDigestToManager'
    | 'dealAuditDigestToHead'
    | 'dealAuditDigestUserIds'
    | 'dealAuditDigestDepartmentUserIds'
>;

export const DEAL_AUDIT_RUN_NOW_NOTE = {
    disabled:
        'Аудит выключен: по расписанию он не запускается, но этот прогон пройдёт по текущим настройкам.',
    dryRun: 'Включено «Только считать»: карточки не размечаются, сводки не уходят — итог придёт только в Telegram.',
    noRecipients:
        'Не выбран ни один получатель сводки — отправлять некому, итог придёт только в Telegram.',
} as const;

const hasIds = (raw: string): boolean => parseUserIds(raw).length > 0;

/**
 * Предупреждения перед ручным прогоном: всё, из-за чего «Сформировать и
 * отправить» ничего не отправит или поведёт себя не как ждут. Чистая
 * функция — проверяется тестом без БД и очереди.
 */
export const buildDealAuditRunNowNotes = (
    settings: DealAuditRunNowSettings,
): string[] => {
    const notes: string[] = [];
    if (!settings.dealAuditEnabled)
        notes.push(DEAL_AUDIT_RUN_NOW_NOTE.disabled);
    if (settings.dealAuditDryRun) notes.push(DEAL_AUDIT_RUN_NOW_NOTE.dryRun);
    const hasRecipients =
        settings.dealAuditDigestToManager ||
        settings.dealAuditDigestToHead ||
        hasIds(settings.dealAuditDigestUserIds) ||
        hasIds(settings.dealAuditDigestDepartmentUserIds);
    if (!settings.dealAuditDryRun && !hasRecipients) {
        notes.push(DEAL_AUDIT_RUN_NOW_NOTE.noRecipients);
    }
    return notes;
};
