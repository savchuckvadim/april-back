import {
    SupportDialog,
    SupportSignalKind,
} from '../domain/support-dialog.types';
import {
    findPendingClientMessage,
    waitedMinutesOf,
} from '../domain/support-signal.rules';
import {
    supportCrmUrl,
    supportDialogUrl,
} from '../domain/support-signal.formatter';

/** Открытый диалог глазами отчёта: кто, сколько ждёт, где открыть. */
export interface SupportDialogReport {
    sessionId: number;
    chatId: number;
    lineId: number;
    clientName: string;
    clientPortal: string | null;
    operatorName: string | null;
    /** Сколько минут клиент ждёт ответа; 0 — ответили. */
    waitedMinutes: number;
    /** Неотвеченное сообщение клиента; null — ответили. */
    pendingText: string | null;
    url: string;
    /** Карточка CRM на портале линии, к которой привязан диалог. */
    crmUrl: string | null;
}

/** Оповещение в отчёте: что и куда ушло (или ушло бы). */
export interface SupportSignalReport {
    kind: SupportSignalKind;
    sessionId: number;
    clientName: string;
    waitedMinutes: number;
    bellText: string;
    telegramText: string;
    /** Скольким сотрудникам доставлен колокольчик (0 — не слали). */
    bellDelivered: number;
    telegramDelivered: boolean;
    /** Запомнено как разосланное — повторов не будет. */
    remembered: boolean;
}

export interface SupportMonitorRunReport {
    domain: string;
    /** Только считать: ничего не отправлено. */
    dryRun: boolean;
    dialogs: SupportDialogReport[];
    signals: SupportSignalReport[];
    warnings: string[];
}

export function toDialogReport(
    dialog: SupportDialog,
    lineDomain: string,
    now: Date,
): SupportDialogReport {
    const pending = findPendingClientMessage(dialog.messages);
    return {
        sessionId: dialog.sessionId,
        chatId: dialog.chatId,
        lineId: dialog.lineId,
        clientName: dialog.client.name,
        clientPortal: dialog.client.portal,
        operatorName: dialog.operatorId
            ? (dialog.operatorName ?? `сотрудник №${dialog.operatorId}`)
            : null,
        waitedMinutes: waitedMinutesOf(pending, now),
        pendingText: pending?.text ?? null,
        url: supportDialogUrl(lineDomain, dialog.chatId),
        crmUrl: supportCrmUrl(lineDomain, dialog.crm),
    };
}

/** Короткая строка итога такта для журнала. */
export function formatRunSummary(report: SupportMonitorRunReport): string {
    const waiting = report.dialogs.filter(d => d.waitedMinutes > 0).length;
    const mode = report.dryRun ? ' (только считать)' : '';
    return (
        `Поддержка ${report.domain}${mode}: открытых диалогов ${report.dialogs.length}, ` +
        `ждут ответа ${waiting}, оповещений ${report.signals.length}` +
        (report.warnings.length
            ? `; замечания: ${report.warnings.join('; ')}`
            : '')
    );
}
