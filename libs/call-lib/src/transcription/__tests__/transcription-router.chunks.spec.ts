import { Logger } from '@nestjs/common';
import { ChunkTranscriptionError } from '../chunking/chunk-transcription.error';
import { frameIndexAt, phoneMp3 } from '../chunking/__tests__/mp3.fixture';
import { createHashRedis } from '../chunking/__tests__/redis-hash.fixture';
import { YandexOperationFailedError } from '../lib/yandex-stt.errors';
import { yandexGuardKeys } from '../provider/yandex-submission-guard.service';
import { YandexCallBusyError } from '../provider/yandex-submission.errors';
import {
    input,
    makeChunkingSettings,
    makeRouter,
    makeStorage,
    makeVibecode,
    makeWhisper,
    makeYandex,
} from './transcription-router.fixture';

/**
 * Роутер и резка длинных звонков (19.11.2026): длинный звонок при
 * включённой резке распознаётся кусками — бесплатные первыми, Яндекс
 * последним и только за свой кусок; ключ стража у каждого куска свой.
 */
const ENV = { TRANSCRIPTION_YANDEX_MIN_SEC: '600' };
const CALL_KEY = 'test.bitrix24.ru:101';
/** 4167 телефонных кадров ≈ 300 с: пять кусков по минуте. */
const AUDIO = phoneMp3(4167);
const CHUNK_BY_FIRST_FRAME = new Map([
    [0, 1],
    [833, 2],
    [1666, 3],
    [2500, 4],
    [3333, 5],
]);
const chunkNumberOf = (buffer: Buffer): number =>
    CHUNK_BY_FIRST_FRAME.get(frameIndexAt(buffer)) ?? -1;

const ON = { enabled: true, chunkSec: 60, overlapSec: 5, parallel: 1 };
const LONG_CALL = {
    ...input,
    buffer: AUDIO,
    durationSec: 700,
    callKey: CALL_KEY,
};

/** Журнал попыток «распознаватель:кусок» в порядке вызова. */
type CallLog = string[];

/** Whisper-совместимый ответ: «кусок N» одним сегментом; failOn — где падает. */
const whisperReply =
    (log: CallLog, name: string, failOn: readonly number[]) =>
    (buffer: Buffer) => {
        const number = chunkNumberOf(buffer);
        log.push(`${name}:${number}`);
        if (failOn.includes(number)) {
            return Promise.reject(new Error(`[503] ${name} занят`));
        }
        const text = `кусок ${number}`;
        return Promise.resolve({
            text,
            segments: [{ start: 20, end: 21, text }],
        });
    };

const chunkDeps = (
    log: CallLog,
    fail: { vibecode?: number[]; whisper?: number[] } = {},
) => {
    const vibecode = makeVibecode();
    vibecode.transcribeAudioDetailed.mockImplementation(
        whisperReply(log, 'vibecode', fail.vibecode ?? []),
    );
    const whisper = makeWhisper(true);
    whisper.transcribeDetailed.mockImplementation(
        whisperReply(log, 'whisper', fail.whisper ?? []),
    );
    const storage = makeStorage();
    storage.uploadFile.mockImplementation((buffer: Buffer) => {
        log.push(`yandex:${chunkNumberOf(buffer)}`);
        return Promise.resolve('https://s3/audio.mp3');
    });
    const yandex = makeYandex();
    yandex.getTranscriptionDetailed.mockResolvedValue({
        text: 'кусок от яндекса',
        segments: [
            {
                startSec: 20,
                endSec: 21,
                speaker: 'unknown',
                text: 'кусок от яндекса',
            },
        ],
    });
    return { vibecode, whisper, storage, yandex };
};

/** Объекты, загруженные в Object Storage для Яндекса. */
const uploadedKeys = (storage: ReturnType<typeof makeStorage>): string[] =>
    (storage.uploadFile.mock.calls as [Buffer, string][]).map(
        ([, objectKey]) => objectKey,
    );

describe('TranscriptionRouterService: резка длинных звонков', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });

    afterEach(() => jest.restoreAllMocks());

    it('резка выключена — длинный звонок целиком в Яндекс, как раньше', async () => {
        const { router, yandex, vibecode, chunkingSettings, guarded } =
            makeRouter(ENV);
        const result = await router.transcribe(LONG_CALL);
        expect(result.provider).toBe('yandex');
        expect(chunkingSettings.resolve).toHaveBeenCalledWith(input.domain);
        expect(yandex.transcribeAudio).toHaveBeenCalledTimes(1);
        expect(vibecode.transcribeAudioDetailed).not.toHaveBeenCalled();
        expect(guarded.redis.values.get(yandexGuardKeys.sends(CALL_KEY))).toBe(
            '1',
        );
    });

    it('звонок длинный — куски: Vibecode → свой Whisper → Яндекс последним', async () => {
        const log: CallLog = [];
        const deps = chunkDeps(log, { vibecode: [2], whisper: [2] });
        const { router } = makeRouter(ENV, {
            ...deps,
            chunkingSettings: makeChunkingSettings(ON),
        });

        const result = await router.transcribe(LONG_CALL);

        // По плану длинных Яндекс первый, на куске — последний.
        expect(log).toEqual([
            'vibecode:1',
            'vibecode:2',
            'whisper:2',
            'yandex:2',
            'vibecode:3',
            'vibecode:4',
            'vibecode:5',
        ]);
        expect(result.provider).toBe('bitrix-vibecode');
        expect(result.text).toContain('кусок 1');
        expect(result.text).toContain('кусок от яндекса');
        expect(result.text).toContain('кусок 5');
        expect(result.segments?.length).toBeGreaterThanOrEqual(5);
        expect(deps.yandex.transcribeAudio).toHaveBeenCalledTimes(1);
        expect(uploadedKeys(deps.storage)).toEqual([
            'transcription/audio/test.bitrix24.ru/call-report/call_1_2.part2of5.mp3',
        ]);
    });

    it('ключ стража у куска — {callKey}:partNNofMM, в счётчик отправок — секунды куска', async () => {
        const deps = chunkDeps([], { vibecode: [2], whisper: [2] });
        const { router, guarded } = makeRouter(ENV, {
            ...deps,
            chunkingSettings: makeChunkingSettings(ON),
        });

        await router.transcribe(LONG_CALL);

        const chunkKey = `${CALL_KEY}:part02of05`;
        expect(guarded.redis.values.get(yandexGuardKeys.sends(chunkKey))).toBe(
            '1',
        );
        expect(
            guarded.redis.values.has(yandexGuardKeys.operation(chunkKey)),
        ).toBe(true);
        expect(guarded.redis.values.has(yandexGuardKeys.sends(CALL_KEY))).toBe(
            false,
        );
        const [day] = [...guarded.redis.hashes.values()];
        expect(day.get(`${input.domain}|n`)).toBe(1);
        // Кусок — минута с нахлёстом 5 с, а не 700 с всего звонка.
        expect(day.get(`${input.domain}|sec`)).toBe(65);
        // Замок звонка снят после резки.
        expect(guarded.redis.values.has(yandexGuardKeys.lock(CALL_KEY))).toBe(
            false,
        );
    });

    it('короткий звонок — без резки и без чтения её настроек', async () => {
        const chunkingSettings = makeChunkingSettings(ON);
        const { router, vibecode } = makeRouter(ENV, { chunkingSettings });

        const result = await router.transcribe({
            ...LONG_CALL,
            durationSec: 120,
        });

        expect(result.provider).toBe('bitrix-vibecode');
        expect(chunkingSettings.resolve).not.toHaveBeenCalled();
        expect(vibecode.transcribeAudioDetailed).toHaveBeenCalledTimes(1);
        expect(vibecode.transcribeAudioDetailed).toHaveBeenCalledWith(
            AUDIO,
            input.fileName,
            'portal-vibe-key',
        );
    });

    it('не MP3 — звонок целиком прежним путём (Яндекс по плану длинных)', async () => {
        const { router, yandex, vibecode, guarded } = makeRouter(ENV, {
            chunkingSettings: makeChunkingSettings(ON),
        });

        const result = await router.transcribe({
            ...LONG_CALL,
            buffer: Buffer.from('audio'),
        });

        expect(result.provider).toBe('yandex');
        expect(yandex.transcribeAudio).toHaveBeenCalledTimes(1);
        expect(vibecode.transcribeAudioDetailed).not.toHaveBeenCalled();
        expect(guarded.redis.values.get(yandexGuardKeys.sends(CALL_KEY))).toBe(
            '1',
        );
    });

    it('кусок не распознал никто — ошибка звонка, Яндекс на весь звонок не уходит', async () => {
        const deps = chunkDeps([], { vibecode: [3], whisper: [3] });
        deps.yandex.getTranscriptionDetailed.mockRejectedValue(
            new YandexOperationFailedError('битая запись'),
        );
        const { router, guarded } = makeRouter(ENV, {
            ...deps,
            chunkingSettings: makeChunkingSettings(ON),
        });

        await expect(router.transcribe(LONG_CALL)).rejects.toBeInstanceOf(
            ChunkTranscriptionError,
        );
        expect(deps.yandex.transcribeAudio).toHaveBeenCalledTimes(1);
        expect(uploadedKeys(deps.storage)).toEqual([
            'transcription/audio/test.bitrix24.ru/call-report/call_1_2.part3of5.mp3',
        ]);
        expect(guarded.redis.values.has(yandexGuardKeys.sends(CALL_KEY))).toBe(
            false,
        );
        expect(guarded.redis.values.has(yandexGuardKeys.lock(CALL_KEY))).toBe(
            false,
        );
    });

    it('распознаватель звонка — тот, кто распознал больше всего секунд', async () => {
        const log: CallLog = [];
        const deps = chunkDeps(log, { vibecode: [1, 2, 3] });
        const { router, guarded } = makeRouter(ENV, {
            ...deps,
            whisper: makeWhisper(false),
            chunkingSettings: makeChunkingSettings(ON),
        });

        const result = await router.transcribe(LONG_CALL);

        expect(result.provider).toBe('yandex');
        expect(log.filter(entry => entry.startsWith('yandex'))).toEqual([
            'yandex:1',
            'yandex:2',
            'yandex:3',
        ]);
        for (const part of ['01', '02', '03']) {
            expect(
                guarded.redis.values.get(
                    yandexGuardKeys.sends(`${CALL_KEY}:part${part}of05`),
                ),
            ).toBe('1');
        }
    });

    it('звонок уже распознаёт другой запуск — «уже идёт», куски не распознаются', async () => {
        const deps = chunkDeps([]);
        const { router, guarded } = makeRouter(ENV, {
            ...deps,
            chunkingSettings: makeChunkingSettings(ON),
        });
        guarded.redis.values.set(yandexGuardKeys.lock(CALL_KEY), 'чужой');

        await expect(router.transcribe(LONG_CALL)).rejects.toBeInstanceOf(
            YandexCallBusyError,
        );
        expect(deps.vibecode.transcribeAudioDetailed).not.toHaveBeenCalled();
        expect(deps.yandex.transcribeAudio).not.toHaveBeenCalled();
    });

    it('в маршруте только Яндекс — звонок не режется', async () => {
        const deps = chunkDeps([]);
        const { router, guarded } = makeRouter(
            { ...ENV, TRANSCRIPTION_PROVIDER: 'yandex' },
            { ...deps, chunkingSettings: makeChunkingSettings(ON) },
        );

        const result = await router.transcribe(LONG_CALL);

        expect(result.provider).toBe('yandex');
        expect(deps.vibecode.transcribeAudioDetailed).not.toHaveBeenCalled();
        expect(guarded.redis.values.get(yandexGuardKeys.sends(CALL_KEY))).toBe(
            '1',
        );
    });

    it('куски без таймкодов — сторож таймкодов, как у звонка целиком', async () => {
        const { router } = makeRouter(ENV, {
            chunkingSettings: makeChunkingSettings(ON),
        });

        const result = await router.transcribe(LONG_CALL);

        expect(result.provider).toBe('bitrix-vibecode');
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('Распознавание без таймкодов: Vibecode'),
            expect.objectContaining({ domain: input.domain }),
        );
    });

    it('повтор после упавшего куска продолжает с Redis: готовые куски не распознаются заново', async () => {
        const progress = createHashRedis();
        const first = chunkDeps([], { vibecode: [3], whisper: [3] });
        first.yandex.getTranscriptionDetailed.mockRejectedValue(
            new YandexOperationFailedError('битая запись'),
        );
        const failed = makeRouter(ENV, {
            ...first,
            chunkingSettings: makeChunkingSettings(ON),
            chunkRedis: progress.redis,
        });
        await expect(failed.router.transcribe(LONG_CALL)).rejects.toThrow(
            'кусок 3 из 5',
        );

        const log: CallLog = [];
        const retry = makeRouter(ENV, {
            ...chunkDeps(log),
            chunkingSettings: makeChunkingSettings(ON),
            chunkRedis: progress.redis,
            guarded: failed.guarded,
        });
        const result = await retry.router.transcribe(LONG_CALL);

        expect(log).toEqual(['vibecode:3', 'vibecode:4', 'vibecode:5']);
        expect(result.text).toContain('кусок 1');
        expect(result.text).toContain('кусок 5');
    });
});
