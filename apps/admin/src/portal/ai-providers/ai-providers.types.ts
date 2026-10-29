import type { TranscriptionRouterMode } from '@lib/call-lib/transcription/provider/transcription-provider.types';
import type { EgressProxyStatus } from '@lib/egress-proxy';

/** Чей ключ или настройка действует: портала (БД) или приложения (env). */
export const AI_PROVIDER_SOURCES = ['portal', 'env'] as const;
export type AiProviderSource = (typeof AI_PROVIDER_SOURCES)[number];

/** Итог живой проверки endpoint'а (GET /models). */
export interface AiEndpointProbe {
    ok: boolean;
    /** По-русски: «отвечает», «HTTP 401 — ключ не принят», «нет связи: …». */
    message: string;
    durationMs: number;
}

/** Одна строка чек-листа: провайдер LLM или транскрибатор. */
export interface AiProviderReadiness {
    /** Код провайдера (LlmProviderCode или TranscriptionProvider). */
    code: string;
    /** Название для админки по-русски. */
    title: string;
    /** Участвует ли в работе при текущем режиме/порядке портала. */
    inUse: boolean;
    /** Настроен (есть ключ/адрес); подробность — в issue. */
    configured: boolean;
    /** Почему провайдер не сработает; null — настроен. */
    issue: string | null;
    source: AiProviderSource | null;
    /** Хост endpoint'а — куда пойдёт вызов; null — неизвестен. */
    endpointHost: string | null;
    /** Пойдёт ли вызов через исходящий прокси за рубеж. */
    viaProxy: boolean;
    /** Живая проверка; null — не запрашивалась или неприменима. */
    probe: AiEndpointProbe | null;
}

/** Готовность провайдеров AI портала целиком. */
export interface PortalAiProvidersReadiness {
    domain: string;
    /** Провайдеры LLM в действующем порядке (первый — основной). */
    llmOrder: AiProviderReadiness[];
    llmOrderSource: AiProviderSource;
    transcriptionMode: TranscriptionRouterMode;
    transcriptionModeSource: AiProviderSource;
    transcription: AiProviderReadiness[];
    egressProxy: EgressProxyStatus;
    /** Когда собран чек-лист (ISO). */
    checkedAt: string;
}
