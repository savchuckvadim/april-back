import type {
    ClientCallDirection,
    ClientCallOwnerType,
} from './client-calls.const';

/** К чему в CRM привязано дело звонка. */
export interface ClientCallOwner {
    type: ClientCallOwnerType;
    id: number;
}

/** Звонок клиента с записью — то, что известно из дела Битрикса. */
export interface ClientCallActivity {
    activityId: number;
    /** Начало звонка по делу, ISO 8601; дату не разобрать — null. */
    startedAt: string | null;
    direction: ClientCallDirection | null;
    responsibleId: number | null;
    owner: ClientCallOwner | null;
    subject: string | null;
}

/** О чём договорились в звонке. */
export interface ClientCallNextStep {
    set: boolean;
    description: string | null;
    date: string | null;
}

/** Короткий итог разбора для строки списка. */
export interface ClientCallBrief {
    /** Название типа звонка; кода нет в справочнике — null. */
    callTypeTitle: string | null;
    summary: string | null;
    nextStep: ClientCallNextStep | null;
    /** Сколько возражений нашёл разбор. */
    objections: number;
    /** Разбор неполный: часть проходов не ответила. */
    incomplete: boolean;
}
