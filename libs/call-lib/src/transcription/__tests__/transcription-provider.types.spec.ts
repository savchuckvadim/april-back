import {
    TRANSCRIPTION_PROVIDERS,
    TRANSCRIPTION_ROUTER_MODES,
    forcedProviderOf,
    isTranscriptionRouterMode,
    parseTranscriptionRouterMode,
} from '../provider/transcription-provider.types';

describe('режимы и провайдеры транскрибации', () => {
    it('parseTranscriptionRouterMode: известный код как есть, мусор и пусто — auto', () => {
        expect(parseTranscriptionRouterMode(' whisper ')).toBe('whisper');
        expect(parseTranscriptionRouterMode('yandex')).toBe('yandex');
        expect(parseTranscriptionRouterMode('deepgram')).toBe('auto');
        expect(parseTranscriptionRouterMode(undefined)).toBe('auto');
        expect(parseTranscriptionRouterMode('')).toBe('auto');
    });

    it('isTranscriptionRouterMode принимает только коды списка', () => {
        for (const mode of TRANSCRIPTION_ROUTER_MODES) {
            expect(isTranscriptionRouterMode(mode)).toBe(true);
        }
        expect(isTranscriptionRouterMode(null)).toBe(false);
        expect(isTranscriptionRouterMode('AUTO')).toBe(false);
    });

    it('forcedProviderOf: принудительный режим → один провайдер, auto → null', () => {
        expect(forcedProviderOf('yandex')).toBe('yandex');
        expect(forcedProviderOf('vibecode')).toBe('bitrix-vibecode');
        expect(forcedProviderOf('whisper')).toBe('local-whisper');
        expect(forcedProviderOf('auto')).toBeNull();
        // каждый принудительный режим указывает на существующий провайдер
        for (const mode of TRANSCRIPTION_ROUTER_MODES.filter(
            m => m !== 'auto',
        )) {
            expect(TRANSCRIPTION_PROVIDERS).toContain(forcedProviderOf(mode));
        }
    });
});
