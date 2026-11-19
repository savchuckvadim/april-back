import { Logger } from '@nestjs/common';
import { yandexGuardKeys } from '../provider/yandex-submission-guard.service';
import {
    YandexCallBusyError,
    YandexSubmitLimitError,
} from '../provider/yandex-submission.errors';
import { YandexOperationPendingError } from '../services/streaming-transcription.service';
import { input, makeRouter, makeYandex } from './transcription-router.fixture';

/**
 * Роутер и страж отправок в Яндекс (19.11.2026): ключ звонка — dedupKey
 * конвейера; отказ стража не уводит платный звонок на запасной путь.
 */
const ENV = { TRANSCRIPTION_YANDEX_MIN_SEC: '600' };
const CALL_KEY = 'test.bitrix24.ru:101';

describe('TranscriptionRouterService: страж отправок в Яндекс', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });

    afterEach(() => jest.restoreAllMocks());

    it('ключ звонка — callKey конвейера: попытка и номер операции записаны под ним', async () => {
        const { router, guarded } = makeRouter(ENV);
        await router.transcribe({
            ...input,
            durationSec: 700,
            callKey: CALL_KEY,
        });
        expect(guarded.redis.values.get(yandexGuardKeys.sends(CALL_KEY))).toBe(
            '1',
        );
        expect(
            guarded.redis.values.has(yandexGuardKeys.operation(CALL_KEY)),
        ).toBe(true);
    });

    it('без callKey — ключ по хэшу записи, тот же звонок узнаётся повторно', async () => {
        const yandex = makeYandex();
        yandex.getTranscriptionDetailed
            .mockRejectedValueOnce(new YandexOperationPendingError('долго'))
            .mockResolvedValueOnce({ text: 'yandex text', segments: [] });
        const { router } = makeRouter(ENV, { yandex });

        await expect(
            router.transcribe({ ...input, durationSec: 700 }),
        ).rejects.toThrow('долго');
        await expect(
            router.transcribe({ ...input, durationSec: 700 }),
        ).resolves.toMatchObject({ provider: 'yandex' });
        expect(yandex.transcribeAudio).toHaveBeenCalledTimes(1);
    });

    it('звонок уже распознаётся — отказ без отправки и без ухода на Vibecode', async () => {
        const { router, guarded, yandex, vibecode } = makeRouter(ENV);
        guarded.redis.values.set(yandexGuardKeys.lock(CALL_KEY), 'чужой');

        await expect(
            router.transcribe({
                ...input,
                durationSec: 700,
                callKey: CALL_KEY,
            }),
        ).rejects.toBeInstanceOf(YandexCallBusyError);
        expect(yandex.transcribeAudio).not.toHaveBeenCalled();
        expect(vibecode.transcribeAudioDetailed).not.toHaveBeenCalled();
    });

    it('лимит отправок исчерпан — отказ без отправки и без ухода на Vibecode', async () => {
        const { router, guarded, yandex, vibecode } = makeRouter(ENV);
        guarded.redis.values.set(yandexGuardKeys.sends(CALL_KEY), '3');

        await expect(
            router.transcribe({
                ...input,
                durationSec: 700,
                callKey: CALL_KEY,
            }),
        ).rejects.toBeInstanceOf(YandexSubmitLimitError);
        expect(yandex.transcribeAudio).not.toHaveBeenCalled();
        expect(vibecode.transcribeAudioDetailed).not.toHaveBeenCalled();
    });
});
