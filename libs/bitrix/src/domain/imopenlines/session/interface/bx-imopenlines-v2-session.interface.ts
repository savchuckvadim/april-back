// Типы метода imopenlines.v2.Session.list — по документации Bitrix
// (api-reference/imopenlines/statistics/imopenlines-v2-session-list).
// Требует scope `imopenlines`. На бесплатном тарифе отвечает TARIFF_RESTRICTION.

/** Статусы сессии открытой линии (фильтр `status` и поле ответа). */
export const BX_IMOPENLINES_SESSION_STATUSES = [
    'new',
    'answered',
    'closed',
    'spam',
    'paused',
] as const;
export type BxImOpenlinesSessionStatus =
    (typeof BX_IMOPENLINES_SESSION_STATUSES)[number];

/** Причины закрытия сессии (фильтр `closeReason`, нельзя вместе со `status`). */
export const BX_IMOPENLINES_SESSION_CLOSE_REASONS = [
    'operator',
    'auto',
    'spam',
    'client',
    'replyLimit',
] as const;
export type BxImOpenlinesSessionCloseReason =
    (typeof BX_IMOPENLINES_SESSION_CLOSE_REASONS)[number];

/** Поля сортировки списка сессий. */
export const BX_IMOPENLINES_SESSION_ORDER_FIELDS = [
    'dateCreate',
    'dateClose',
    'waitAnswer',
    'waitClose',
] as const;
export type BxImOpenlinesSessionOrderField =
    (typeof BX_IMOPENLINES_SESSION_ORDER_FIELDS)[number];

export type BxImOpenlinesSessionOrderDirection = 'asc' | 'desc';

/** Клиентская оценка диалога (фильтр `vote`). */
export type BxImOpenlinesSessionVote = 'like' | 'dislike' | 'none' | 'any';

/** Максимум элементов в списочных фильтрах (`configIdList` и т.п.). */
export const BX_IMOPENLINES_SESSION_LIST_MAX_IDS = 1000;
/** Размер страницы: от 1 до 200, по умолчанию 50. */
export const BX_IMOPENLINES_SESSION_LIST_MAX_LIMIT = 200;

export interface IBXImOpenlinesV2SessionListRequest {
    /** Идентификатор открытой линии (CONFIG_ID). */
    configId?: number;
    /** Список линий; при одновременной передаче с configId побеждает список. */
    configIdList?: number[];
    operatorId?: number;
    operatorIdList?: number[];
    /** Код канала (imconnector.list): `network`, `livechat`, `telegrambot`… */
    source?: string;
    sourceList?: string[];
    status?: BxImOpenlinesSessionStatus;
    closeReason?: BxImOpenlinesSessionCloseReason;
    /** Границы периода создания — ISO 8601, период не больше 366 дней. */
    dateCreateFrom?: string;
    dateCreateTo?: string;
    dateCloseFrom?: string;
    dateCloseTo?: string;
    vote?: BxImOpenlinesSessionVote;
    hasVoteHead?: boolean;
    kpiFirstAnswer?: boolean;
    hasCrm?: boolean;
    /** Время до первого ответа, секунды. */
    waitAnswerFrom?: number;
    waitAnswerTo?: number;
    waitCloseFrom?: number;
    waitCloseTo?: number;
    order?: BxImOpenlinesSessionOrderField;
    orderDirection?: BxImOpenlinesSessionOrderDirection;
    offset?: number;
    limit?: number;
}

/** Сессия (диалог) открытой линии в ответе Session.list. */
export interface IBXImOpenlinesV2Session {
    id: number;
    configId: number;
    /** Канал: `network`, `livechat`, … */
    source: string;
    /** Оператор, на котором диалог; 0 — ещё никто не взял. */
    operatorId: number;
    /** Пользователь-клиент (для коннекторов — служебный extranet-пользователь). */
    userId: number;
    userCode: string;
    /** Чат диалога: DIALOG_ID для im.* = `chat<chatId>`. */
    chatId: number;
    dateCreate: string;
    dateClose: string | null;
    /** Первый ответ оператора; null — клиенту ещё не отвечали. */
    dateFirstAnswer: string | null;
    dateOperatorAnswer: string | null;
    /**
     * Статус. Внимание: `answered` означает «диалог взят оператором», а не
     * «клиенту ответили» (боевое наблюдение 26.10.2026: answered при
     * dateFirstAnswer = null). Ответ проверяется по сообщениям.
     */
    status: BxImOpenlinesSessionStatus;
    closeReason: BxImOpenlinesSessionCloseReason | null;
    vote: string | null;
    voteHead: number | null;
    commentHead: string | null;
    /** Связь с CRM: `deal` | `lead` | `contact` | `company`, либо null. */
    crmEntityType: string | null;
    crmEntityId: number | null;
    queueTransfers: number;
    waitAnswer: number | null;
    waitClose: number | null;
    kpiFirstAnswer: boolean | null;
    messageCount: number;
}

export interface IBXImOpenlinesV2SessionListResponse {
    sessions: IBXImOpenlinesV2Session[];
    hasNextPage: boolean;
}
