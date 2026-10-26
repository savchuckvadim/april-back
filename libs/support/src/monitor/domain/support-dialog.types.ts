/**
 * Доменная модель мониторинга линии поддержки. Ничего не знает о Битриксе:
 * инфраструктура переводит сессии и сообщения портала в эти типы.
 */

/** Кто написал сообщение диалога. */
export const SUPPORT_AUTHOR_ROLES = ['client', 'staff', 'other'] as const;
export type SupportAuthorRole = (typeof SUPPORT_AUTHOR_ROLES)[number];

/** Статусы открытого диалога, которые смотрит монитор. */
export const SUPPORT_OPEN_STATUSES = ['new', 'answered'] as const;
export type SupportOpenStatus = (typeof SUPPORT_OPEN_STATUSES)[number];

export interface SupportMessage {
    id: number;
    at: Date;
    /** client — клиент; staff — сотрудник; other — система, бот линии. */
    role: SupportAuthorRole;
    authorName: string | null;
    /** Текст без разметки Битрикса. */
    text: string;
}

export interface SupportClient {
    userId: number;
    name: string;
    /** Портал клиента для канала Network (`alfacentr.bitrix24.ru`), иначе null. */
    portal: string | null;
}

export interface SupportCrmBinding {
    entityType: string;
    entityId: number;
}

/** Открытый диалог линии с последними сообщениями. */
export interface SupportDialog {
    sessionId: number;
    chatId: number;
    lineId: number;
    /** Канал: `network`, `livechat`, … */
    source: string;
    status: SupportOpenStatus;
    createdAt: Date;
    /** Оператор, на котором диалог; 0 — ещё никто не взял. */
    operatorId: number;
    operatorName: string | null;
    client: SupportClient;
    crm: SupportCrmBinding | null;
    /** Последние сообщения по возрастанию id. */
    messages: SupportMessage[];
}

/** Уровни ожидания клиента. */
export const SUPPORT_WAIT_LEVELS = ['remind', 'escalate'] as const;
export type SupportWaitLevel = (typeof SUPPORT_WAIT_LEVELS)[number];

export interface SupportWaitThresholds {
    /** Минут ожидания до напоминания. */
    remindMinutes: number;
    /** Минут ожидания до срочного повтора; больше remindMinutes. */
    escalateMinutes: number;
}

/**
 * Память монитора о диалоге: что уже разослано. Одно событие — одно
 * оповещение, поэтому правило сверяется с памятью, а не только со временем.
 */
export interface SupportDialogMemory {
    /** О новом диалоге уже оповестили. */
    announced: boolean;
    /** Первое неотвеченное сообщение клиента, по которому шли напоминания. */
    waitingFor: number | null;
    /** Какие уровни ожидания по нему уже разосланы. */
    levels: SupportWaitLevel[];
}

export const SUPPORT_SIGNAL_KINDS = [
    'new_dialog',
    'waiting',
    'escalation',
] as const;
export type SupportSignalKind = (typeof SUPPORT_SIGNAL_KINDS)[number];

/** Оповещение, которое нужно разослать по диалогу. */
export interface SupportSignal {
    kind: SupportSignalKind;
    dialog: SupportDialog;
    /** Первое сообщение клиента, на которое ещё не ответили; null — не ждёт. */
    pending: SupportMessage | null;
    /** Сколько минут клиент ждёт ответа; 0 — не ждёт. */
    waitedMinutes: number;
}

/** Итог правила по одному диалогу. */
export interface SupportDecision {
    signal: SupportSignal | null;
    memory: SupportDialogMemory;
}
