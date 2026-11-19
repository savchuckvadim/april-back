import { Logger } from '@nestjs/common';
import type { TranscriptSegment } from '../../types/transcript-segment.types';
import { ChunkTranscriptionError } from '../chunk-transcription.error';
import {
    CHUNK_PROGRESS_TTL_SEC,
    chunkProgressField,
    chunkProgressKey,
} from '../chunk-progress.store';
import { ChunkedTranscriptionService } from '../chunked-transcription.service';
import type {
    ChunkAttempt,
    ChunkInfo,
    TranscribeChunkedInput,
} from '../chunked-transcription.types';
import { frameIndexAt, phoneMp3 } from './mp3.fixture';
import { createHashRedis, type HashRedis } from './redis-hash.fixture';

/** 4167 телефонных кадров ≈ 300 с: пять кусков по минуте. */
const AUDIO = phoneMp3(4167);
/** Первый кадр каждого куска при chunkSec 60 → номер куска. */
const CHUNK_BY_FIRST_FRAME = new Map([
    [0, 1],
    [833, 2],
    [1666, 3],
    [2500, 4],
    [3333, 5],
]);
const CALL_KEY = 'gsr.bitrix24.ru:777';

const chunkNumberOf = (buffer: Buffer): number =>
    CHUNK_BY_FIRST_FRAME.get(frameIndexAt(buffer)) ?? -1;

/** Распознаватель: «кусок N» одним сегментом; failOn — номера кусков, где он падает. */
function recognizer(
    provider: string,
    failOn: readonly number[] = [],
): ChunkAttempt & { calls: number[] } {
    const calls: number[] = [];
    return {
        provider,
        calls,
        transcribe: (chunk: Buffer) => {
            const number = chunkNumberOf(chunk);
            calls.push(number);
            if (failOn.includes(number)) {
                return Promise.reject(new Error(`[503] ${provider} занят`));
            }
            const text = `кусок ${number}`;
            const segments: TranscriptSegment[] = [
                { startSec: 20, endSec: 21, speaker: 'unknown', text },
            ];
            return Promise.resolve({ text, segments });
        },
    };
}

const input = (
    attempts: readonly ChunkAttempt[],
    patch: Partial<TranscribeChunkedInput> = {},
): TranscribeChunkedInput => ({
    callKey: CALL_KEY,
    audio: AUDIO,
    fileName: 'record-777.mp3',
    chunkSec: 60,
    overlapSec: 5,
    parallel: 3,
    attempts,
    ...patch,
});

const ALL_TEXT = 'кусок 1 кусок 2 кусок 3 кусок 4 кусок 5';

describe('ChunkedTranscriptionService', () => {
    let store: HashRedis;
    let service: ChunkedTranscriptionService;
    let warn: jest.SpyInstance;

    beforeEach(() => {
        store = createHashRedis();
        service = new ChunkedTranscriptionService(store.redis);
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });

    afterEach(() => jest.restoreAllMocks());

    it('куски распознаются по одному разу и склеиваются по порядку', async () => {
        const vibecode = recognizer('VibeCode');
        const result = await service.transcribeChunked(input([vibecode]));

        expect(vibecode.calls.sort()).toEqual([1, 2, 3, 4, 5]);
        expect(result?.text).toBe(ALL_TEXT);
        expect(result?.chunks).toBe(5);
        expect(result?.providers).toEqual({ VibeCode: 5 });
        expect(result?.providerSeconds.VibeCode).toBeCloseTo(300 + 4 * 5, 0);
        expect(result?.untimed).toBe(false);
        // Сегмент второго куска сдвинут на его начало (59,976 с).
        expect(result?.segments?.[1]).toMatchObject({
            startSec: 79.98,
            text: 'кусок 2',
        });
    });

    it('одновременно — не больше parallel кусков', async () => {
        let active = 0;
        let peak = 0;
        const slow: ChunkAttempt = {
            provider: 'VibeCode',
            transcribe: async (chunk: Buffer) => {
                active += 1;
                peak = Math.max(peak, active);
                await new Promise(resolve => setTimeout(resolve, 5));
                active -= 1;
                return {
                    text: `кусок ${chunkNumberOf(chunk)}`,
                    segments: null,
                };
            },
        };

        const result = await service.transcribeChunked(
            input([slow], { parallel: 2 }),
        );

        expect(peak).toBe(2);
        expect(result?.text).toBe(ALL_TEXT);
        expect(result?.untimed).toBe(true);
        expect(result?.segments).toBeNull();
    });

    it('первый распознаватель отказал — кусок уходит следующему', async () => {
        const vibecode = recognizer('VibeCode', [3]);
        const yandex = recognizer('Yandex');

        const result = await service.transcribeChunked(
            input([vibecode, yandex]),
        );

        expect(yandex.calls).toEqual([3]);
        expect(result?.providers).toEqual({ VibeCode: 4, Yandex: 1 });
        expect(result?.text).toBe(ALL_TEXT);
    });

    it('кусок не распознал никто — ошибка звонка с номером куска, новые куски не начинаются', async () => {
        const vibecode = recognizer('VibeCode', [2]);
        const yandex = recognizer('Yandex', [2]);

        const error: unknown = await service
            .transcribeChunked(input([vibecode, yandex], { parallel: 1 }))
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(ChunkTranscriptionError);
        expect((error as ChunkTranscriptionError).chunkIndex).toBe(1);
        expect((error as Error).message).toContain('кусок 2 из 5');
        expect((error as Error).message).toContain(
            'Yandex: [503] Yandex занят',
        );
        // По одному куску за раз: после отказа второго третий не начинался.
        expect(vibecode.calls).toEqual([1, 2]);

        const hash = store.hashes.get(chunkProgressKey(CALL_KEY));
        expect(
            JSON.parse(hash?.get(chunkProgressField(1)) ?? '{}'),
        ).toMatchObject({
            status: 'failed',
            errors: [
                'VibeCode: [503] VibeCode занят',
                'Yandex: [503] Yandex занят',
            ],
        });
        expect(store.ttlByKey.get(chunkProgressKey(CALL_KEY))).toBe(
            CHUNK_PROGRESS_TTL_SEC,
        );
    });

    it('повторный запуск берёт готовые куски из Redis и удаляет прогресс после склейки', async () => {
        const first = recognizer('Yandex', [4]);
        await expect(
            service.transcribeChunked(input([first], { parallel: 1 })),
        ).rejects.toBeInstanceOf(ChunkTranscriptionError);
        expect(first.calls).toEqual([1, 2, 3, 4]);

        const second = recognizer('VibeCode');
        const result = await service.transcribeChunked(input([second]));

        // Куски 1–3 уже распознаны Яндексом — второй раз за них не платим.
        expect(second.calls.sort()).toEqual([4, 5]);
        expect(result?.providers).toEqual({ Yandex: 3, VibeCode: 2 });
        expect(result?.text).toBe(ALL_TEXT);
        expect(store.hashes.has(chunkProgressKey(CALL_KEY))).toBe(false);
    });

    it('прогресс другой нарезки не используется', async () => {
        const first = recognizer('Yandex', [2]);
        await expect(
            service.transcribeChunked(input([first], { parallel: 1 })),
        ).rejects.toBeInstanceOf(ChunkTranscriptionError);

        const second = recognizer('VibeCode');
        const result = await service.transcribeChunked(
            input([second], { chunkSec: 120 }),
        );

        expect(result?.chunks).toBe(3);
        expect(result?.providers).toEqual({ VibeCode: 3 });
    });

    it('Redis недоступен — звонок распознаётся без прогресса', async () => {
        store.state.fail = true;
        const vibecode = recognizer('VibeCode');

        const result = await service.transcribeChunked(input([vibecode]));

        expect(result?.text).toBe(ALL_TEXT);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('без Redis в приложении — тоже работает', async () => {
        const result =
            await new ChunkedTranscriptionService().transcribeChunked(
                input([recognizer('VibeCode')]),
            );
        expect(result?.text).toBe(ALL_TEXT);
    });

    it('не MP3 — null, распознаватели не зовутся', async () => {
        const vibecode = recognizer('VibeCode');
        const result = await service.transcribeChunked(
            input([vibecode], { audio: Buffer.from('RIFF....WAVEfmt ') }),
        );
        expect(result).toBeNull();
        expect(vibecode.calls).toEqual([]);
    });

    it('без распознавателей — ошибка вызывающего', async () => {
        await expect(service.transcribeChunked(input([]))).rejects.toThrow(
            'не задано ни одного распознавателя',
        );
    });

    it('распознаватель получает имя файла куска (.mp3) и границы куска', async () => {
        const names: string[] = [];
        const infos: ChunkInfo[] = [];
        const attempt: ChunkAttempt = {
            provider: 'VibeCode',
            transcribe: (_chunk, fileName, info) => {
                names.push(fileName);
                infos.push(info);
                return Promise.resolve({ text: '', segments: null });
            },
        };
        await service.transcribeChunked(
            input([attempt], { parallel: 1, fileName: 'record-777.wav' }),
        );
        expect(names[0]).toBe('record-777.part1of5.mp3');
        expect(infos[1]).toEqual({
            index: 1,
            count: 5,
            startSec: 59.976,
            endSec: 125.064,
        });
    });
});
