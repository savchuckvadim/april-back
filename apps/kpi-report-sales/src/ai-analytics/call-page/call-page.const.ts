/**
 * Страница разбора звонка на сайте «Отчёта»: маршруты, справочники значений
 * ответа и тексты для человека.
 */

/** Карточка звонка по ссылке-пропуску. */
export const CALL_PAGE_ROUTE = 'call-page/:token' as const;
/** Ссылки на страницы разбора для списка звонков — под сессией портала. */
export const CALL_PAGE_LINKS_ROUTE = 'call-page/links' as const;
/** Сколько звонков можно запросить за один раз. */
export const CALL_PAGE_LINKS_MAX = 100;
/** Запись разговора потоком. */
export const CALL_PAGE_AUDIO_ROUTE = 'call-page/:token/audio' as const;

export const CALL_PAGE_TONES = ['good', 'bad', 'warn', 'neutral'] as const;
export type CallPageTone = (typeof CALL_PAGE_TONES)[number];

export const CALL_PAGE_HIGHLIGHT_KINDS = [
    'signal',
    'objection',
    'risk',
    'methodology',
    'issue',
    'price',
] as const;
export type CallPageHighlightKind = (typeof CALL_PAGE_HIGHLIGHT_KINDS)[number];

/** Названия групп подсветок — подписи бейджей. */
export const CALL_PAGE_HIGHLIGHT_KIND_TITLES: Readonly<
    Record<CallPageHighlightKind, string>
> = {
    signal: 'Ошибки менеджера',
    objection: 'Возражения',
    risk: 'Сигналы риска',
    methodology: 'Методика',
    issue: 'Сбои',
    price: 'Цены',
};

export const CALL_PAGE_SPEAKERS = ['manager', 'client'] as const;
export type CallPageSpeaker = (typeof CALL_PAGE_SPEAKERS)[number];

export const CALL_PAGE_CHECKPOINT_STATUSES = [
    'done',
    'missed',
    'not_applicable',
] as const;
export type CallPageCheckpointStatus =
    (typeof CALL_PAGE_CHECKPOINT_STATUSES)[number];

export const CALL_PAGE_CHECKPOINT_STATUS_TITLES: Readonly<
    Record<CallPageCheckpointStatus, string>
> = {
    done: 'Выполнен',
    missed: 'Пропущен',
    not_applicable: 'Не относится к звонку',
};

/** Тексты ошибок для человека: без кодов и названий сервисов. */
export const CALL_PAGE_MESSAGES = {
    invalidLink: 'Ссылка недействительна или отозвана',
    noAnalysis: 'По этому звонку ещё нет разбора',
    noAudio: 'Запись разговора недоступна',
} as const;

/** Сколько секунд помним адрес записи и имя менеджера. */
export const CALL_PAGE_AUDIO_URL_TTL_SEC = 10 * 60;
export const CALL_PAGE_MANAGER_NAME_TTL_SEC = 60 * 60;
