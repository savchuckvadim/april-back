/** Кандидат в Redis-сессии (все данные для apply без повторного скана). */
export interface SsRestoreSessionCandidate {
    taskId: number;
    title: string;
    closedDate: string;
    /** Дата будущего элемента (dd.MM.yyyy HH:mm:ss). */
    elementDate: string;
    responsibleId: number;
    companyId: number | null;
    dealId: number | null;
    contactId: number | null;
    ufCrmTask: string[];
    comment: string;
    createdRowId: number | null;
}

/** Сессия scan → apply/discard (Redis, TTL 1 час). */
export interface SsRestoreSession {
    domain: string;
    candidates: SsRestoreSessionCandidate[];
}
