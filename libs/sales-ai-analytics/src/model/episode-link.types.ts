/**
 * Словарь сцепки звонка с эпизодом сделки (план `ai-sales-analytics`, §4.1
 * «Сцепка»): уверенности, пути, причины, формы звонка, открытой сделки,
 * подсказок и результата сцепки.
 *
 * Вынесено из `episode-link.ts`, чтобы рабочий файл оставался в пределах
 * 300 строк; публичный вход слоя прежний — `model/episode-link`
 * реэкспортирует этот словарь.
 */
/** Уверенность сцепки: high — однозначно, low — выбор из нескольких. */
export const AI_CALL_LINK_CONFIDENCES = ['high', 'low', 'none'] as const;

export type AiCallLinkConfidence = (typeof AI_CALL_LINK_CONFIDENCES)[number];

/** Каким путём звонок дошёл до сделки. */
export const AI_CALL_LINK_PATHS = [
    'deal',
    'related',
    'lead',
    'company',
    'contact',
    'none',
] as const;

export type AiCallLinkPath = (typeof AI_CALL_LINK_PATHS)[number];

/** Причина уверенности — показывается в «Как считаем» и в аудите данных. */
export const AI_CALL_LINK_REASONS = [
    'direct-deal',
    'related-deal',
    'lead-converted',
    'lead-not-converted',
    'single-open-deal',
    'many-open-deals',
    'no-open-deal',
    'no-episode',
] as const;

export type AiCallLinkReason = (typeof AI_CALL_LINK_REASONS)[number];

/** Сущность, на которую записан звонок телефонии. */
export const AI_CALL_ENTITY_TYPES = [
    'deal',
    'lead',
    'contact',
    'company',
] as const;

export type AiCallEntityType = (typeof AI_CALL_ENTITY_TYPES)[number];

/** Звонок в том виде, в каком его подаёт шаг приложения. */
export interface CallForLink {
    readonly callId: string;
    /** Момент звонка, ISO 8601. */
    readonly at: string;
    readonly entityType: AiCallEntityType;
    readonly entityId: string;
}

/** Открытая сделка компании/контакта — вход запасного пути. */
export interface OpenDealRef {
    readonly dealId: string;
    readonly openedAt: string;
    /** Дата закрытия; null — сделка ещё открыта. */
    readonly closedAt: string | null;
    /** Последняя активность по сделке — по ней выбирается ближайшая. */
    readonly lastActivityAt: string | null;
}

/** Подсказки сцепки: конверсии лидов, xo-сделки и открытые сделки. */
export interface EpisodeLinkHints {
    readonly leadToDeal?: Readonly<Record<string, string>>;
    readonly relatedToMainDeal?: Readonly<Record<string, string>>;
    readonly openDealsByCompany?: Readonly<
        Record<string, readonly OpenDealRef[]>
    >;
    readonly openDealsByContact?: Readonly<
        Record<string, readonly OpenDealRef[]>
    >;
}

/** Результат сцепки одного звонка. */
export interface CallLink {
    readonly callId: string;
    /** Сделка, к которой сцеплён звонок; null — не сцеплён. */
    readonly dealId: string | null;
    /** Ключ эпизода `entityId#index`; null — эпизод не найден. */
    readonly episodeKey: string | null;
    readonly episodeIndex: number | null;
    /** Стадия начала эпизода — знаменатель стадийной θ. */
    readonly stageCode: string | null;
    readonly confidence: AiCallLinkConfidence;
    readonly path: AiCallLinkPath;
    readonly reason: AiCallLinkReason;
}
