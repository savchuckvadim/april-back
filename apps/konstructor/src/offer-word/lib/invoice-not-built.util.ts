/**
 * Текст для менеджера: КП отдано, счёт к нему остался несобранным.
 * Причина — одна фраза без точки в конце: «для портала не найден шаблон счёта».
 */
export const describeInvoiceNotBuilt = (reason: string): string =>
    `Счёт не сформирован: ${reason}`;

/** Сообщение ошибки для показа менеджеру и записи в лог. */
export const getErrorReason = (error: unknown): string => {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return typeof error === 'string' && error ? error : 'неизвестная ошибка';
};
