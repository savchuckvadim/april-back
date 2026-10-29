/**
 * Коды транскрибаторов и режимов маршрутизации — отдельно от роутера,
 * чтобы чек-лист готовности в админке и утилита настроек портала
 * импортировали типы, не затягивая Yandex/VibeCode-модули.
 */
export const TRANSCRIPTION_PROVIDERS = [
    'yandex',
    'bitrix-vibecode',
    'local-whisper',
] as const;
export type TranscriptionProvider = (typeof TRANSCRIPTION_PROVIDERS)[number];

/** Режим выбора провайдера: auto — по длительности, иначе принудительно. */
export const TRANSCRIPTION_ROUTER_MODES = [
    'auto',
    'yandex',
    'vibecode',
    'whisper',
] as const;
export type TranscriptionRouterMode =
    (typeof TRANSCRIPTION_ROUTER_MODES)[number];

export const isTranscriptionRouterMode = (
    value: unknown,
): value is TranscriptionRouterMode =>
    typeof value === 'string' &&
    (TRANSCRIPTION_ROUTER_MODES as readonly string[]).includes(value);

/** Режим из env TRANSCRIPTION_PROVIDER: пусто или неизвестно — auto. */
export const parseTranscriptionRouterMode = (
    raw: string | undefined,
): TranscriptionRouterMode => {
    const value = raw?.trim();
    return isTranscriptionRouterMode(value) ? value : 'auto';
};

/** Провайдер, которому принудительный режим отдаёт все звонки; auto — null. */
export const forcedProviderOf = (
    mode: TranscriptionRouterMode,
): TranscriptionProvider | null => {
    switch (mode) {
        case 'yandex':
            return 'yandex';
        case 'vibecode':
            return 'bitrix-vibecode';
        case 'whisper':
            return 'local-whisper';
        default:
            return null;
    }
};
