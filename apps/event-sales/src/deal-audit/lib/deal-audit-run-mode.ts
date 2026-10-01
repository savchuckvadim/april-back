/** Что разрешено одному прогону аудита. */
export interface DealAuditRunMode {
    /** Писать признаки в карточки сделок. */
    readonly canWrite: boolean;
    /** Рассылать сводки о забытых сделках. */
    readonly canNotify: boolean;
    /** Предупреждение для лога и ответа ручки; null — всё штатно. */
    readonly warning: string | null;
}

/** Адресаты сводки из настроек портала — то, что решает «слать ли». */
export interface DealAuditDigestRecipients {
    readonly toManager: boolean;
    readonly toHead: boolean;
    /** Сводка по всей структуре. */
    readonly userIds: readonly number[];
    /** Сводка по своему отделу и подотделам. */
    readonly departmentUserIds: readonly number[];
}

/**
 * Задан ли хоть один адресат сводки. Одно правило на рассылку и на отчёт
 * крона: иначе отчёт пишет «получатели не заданы», а рассылка считает
 * иначе — и разбор «почему не пришло» уходит не туда.
 */
export const hasDigestRecipients = (
    recipients: DealAuditDigestRecipients,
): boolean =>
    recipients.toManager ||
    recipients.toHead ||
    recipients.userIds.length > 0 ||
    recipients.departmentUserIds.length > 0;

export const DEAL_AUDIT_FIELDS_MISSING_WARNING =
    'поля аудита не установлены — карточки не размечены, сводки отправлены';

/**
 * РЕЖИМ ПРОГОНА: разметка и рассылка — два независимых действия.
 *
 * Сводка собирается из вердиктов самого прогона и в поля карточки не
 * смотрит, поэтому неустановленные поля её НЕ блокируют. Раньше рассылка
 * шла только вместе с записью, и портал без полей не получал оповещений
 * вовсе — при включённом аудите и включённых сводках (разбор 28.09.2026).
 *
 * Холостой ход («только считать») по-прежнему выключает и запись, и
 * рассылку: им владелец проверяет пороги, и письмо сотрудникам на этом
 * шаге было бы преждевременным.
 */
export const resolveDealAuditRunMode = (
    dryRun: boolean,
    fieldsInstalled: boolean,
): DealAuditRunMode => {
    if (dryRun) return { canWrite: false, canNotify: false, warning: null };
    return {
        canWrite: fieldsInstalled,
        canNotify: true,
        warning: fieldsInstalled ? null : DEAL_AUDIT_FIELDS_MISSING_WARNING,
    };
};
