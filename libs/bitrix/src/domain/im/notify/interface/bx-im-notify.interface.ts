/** Параметры im.notify.system.add (проверено по apidocs.bitrix24.com). */
export interface IBXImNotifySystemAdd {
    /** Получатель уведомления. */
    USER_ID: number | string;
    /** Текст уведомления (BB-код поддерживается, пробелы обрезаются). */
    MESSAGE: string;
    /** Текст для e-mail/push вместо MESSAGE (необязателен). */
    MESSAGE_OUT?: string;
    /** Тег группировки: уведомления с одним TAG замещают друг друга. */
    TAG?: string;
    /** Подтег (управление скрытием группы уведомлений). */
    SUB_TAG?: string;
}

/** Ответ — id созданного уведомления либо false. */
export type IBXImNotifySystemAddResult = number | false;
