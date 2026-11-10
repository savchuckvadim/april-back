import { AI_TRANSCRIPTION_PROVIDERS } from '@lib/portal-lib/store/ai-settings/portal-transcription-route.types';
import { TRANSCRIPTION_PROVIDERS } from '../provider/transcription-provider.types';
import { YandexSttHttpError } from '../services/streaming-transcription.service';
import {
    ENV_WHISPER,
    input,
    makePortalSettings,
    makeRouter,
    makeVibecode,
    makeWhisper,
    makeYandex,
} from './transcription-router.fixture';

/**
 * Роутер исполняет маршрут распознавания портала (решение владельца
 * 10.11.2026): роли «длинные», «короткие», «запасные», «для скорости» и «для
 * точности», у каждой — своя модель. Сам выбор порядка проверяет спека
 * transcription-route.util; здесь — что роутер зовёт нужный сервис с нужной
 * моделью и честно уходит на запасной.
 */
const portalWithRoute = (route: Record<string, unknown>) =>
    makePortalSettings({ transcriptionRoute: route });

describe('TranscriptionRouterService: маршрут распознавания портала', () => {
    it('коды транскрибаторов в настройках портала совпадают с кодами роутера', () => {
        expect([...AI_TRANSCRIPTION_PROVIDERS]).toEqual([
            ...TRANSCRIPTION_PROVIDERS,
        ]);
    });

    it('роль «короткие» — свой Whisper с моделью роли поверх модели сервиса', async () => {
        const whisper = makeWhisper(true);
        const { router, vibecode } = makeRouter(
            { TRANSCRIPTION_YANDEX_MIN_SEC: '600' },
            {
                whisper,
                portalSettings: portalWithRoute({
                    short: {
                        provider: 'local-whisper',
                        model: 'whisper-large-v3',
                    },
                }),
            },
        );
        const result = await router.transcribe({ ...input, durationSec: 120 });
        expect(result.provider).toBe('local-whisper');
        expect(whisper.transcribeDetailed).toHaveBeenCalledWith(
            input.buffer,
            input.fileName,
            { ...ENV_WHISPER, model: 'whisper-large-v3' },
        );
        expect(vibecode.transcribeAudioDetailed).not.toHaveBeenCalled();
    });

    it('роль «длинные» — VibeCode с моделью роли', async () => {
        const { router, vibecode, yandex } = makeRouter(
            { TRANSCRIPTION_YANDEX_MIN_SEC: '600' },
            {
                portalSettings: portalWithRoute({
                    long: {
                        provider: 'bitrix-vibecode',
                        model: 'bitrix/bitrixgpt-5.6-transcribe',
                    },
                }),
            },
        );
        const result = await router.transcribe({ ...input, durationSec: 900 });
        expect(result.provider).toBe('bitrix-vibecode');
        expect(vibecode.transcribeAudioDetailed).toHaveBeenCalledWith(
            input.buffer,
            input.fileName,
            'portal-vibe-key',
            'bitrix/bitrixgpt-5.6-transcribe',
        );
        expect(yandex.transcribeAudio).not.toHaveBeenCalled();
    });

    it('свои запасные: основной упал — звонок уходит первому запасному маршрута', async () => {
        const vibecode = makeVibecode();
        vibecode.transcribeAudioDetailed.mockRejectedValue(
            new Error('VibeCode 503'),
        );
        const whisper = makeWhisper(true);
        const { router, yandex } = makeRouter(
            {},
            {
                vibecode,
                whisper,
                portalSettings: portalWithRoute({
                    fallbacks: [{ provider: 'local-whisper', model: null }],
                }),
            },
        );
        const result = await router.transcribe({ ...input, durationSec: 120 });
        expect(result.provider).toBe('local-whisper');
        expect(yandex.transcribeAudio).not.toHaveBeenCalled();
    });

    it('пустой список запасных: основной упал — ошибка, запасных не зовём', async () => {
        const vibecode = makeVibecode();
        vibecode.transcribeAudioDetailed.mockRejectedValue(
            new Error('VibeCode 503'),
        );
        const { router, yandex, whisper } = makeRouter(
            {},
            {
                vibecode,
                whisper: makeWhisper(true),
                portalSettings: portalWithRoute({ fallbacks: [] }),
            },
        );
        await expect(
            router.transcribe({ ...input, durationSec: 120 }),
        ).rejects.toThrow('VibeCode 503');
        expect(yandex.transcribeAudio).not.toHaveBeenCalled();
        expect(whisper.transcribeDetailed).not.toHaveBeenCalled();
    });

    it('Яндекс основным и постоянная ошибка (403) — запасной не зовём: вторая попытка не поможет', async () => {
        const yandex = makeYandex();
        yandex.transcribeAudio.mockRejectedValue(
            new YandexSttHttpError(403, 'r', 'submit', 'HTTP 403'),
        );
        const { router, vibecode } = makeRouter(
            {},
            {
                yandex,
                portalSettings: portalWithRoute({
                    short: { provider: 'yandex', model: null },
                    fallbacks: [{ provider: 'bitrix-vibecode', model: null }],
                }),
            },
        );
        await expect(
            router.transcribe({ ...input, durationSec: 120 }),
        ).rejects.toThrow();
        expect(vibecode.transcribeAudioDetailed).not.toHaveBeenCalled();
    });

    it('приоритет «скорость» — роль «для скорости» и на длинный звонок', async () => {
        const whisper = makeWhisper(true);
        const { router, yandex } = makeRouter(
            { TRANSCRIPTION_YANDEX_MIN_SEC: '600' },
            {
                whisper,
                portalSettings: portalWithRoute({
                    priority: 'fast',
                    fast: {
                        provider: 'local-whisper',
                        model: 'whisper-large-v3-turbo',
                    },
                }),
            },
        );
        const result = await router.transcribe({ ...input, durationSec: 1800 });
        expect(result.provider).toBe('local-whisper');
        expect(yandex.transcribeAudio).not.toHaveBeenCalled();
    });

    it('маршрут с мусором вместо ролей — действует режим, как без маршрута', async () => {
        const { router, vibecode } = makeRouter(
            {},
            {
                portalSettings: portalWithRoute({
                    short: { provider: 'deepgram' },
                    priority: 'turbo',
                }),
            },
        );
        const result = await router.transcribe({ ...input, durationSec: 120 });
        expect(result.provider).toBe('bitrix-vibecode');
        expect(vibecode.transcribeAudioDetailed).toHaveBeenCalled();
    });
});
