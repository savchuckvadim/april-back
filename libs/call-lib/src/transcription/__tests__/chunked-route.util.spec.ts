import {
    chunkAttemptSteps,
    chunkCallKey,
    chunkProvidersLine,
    dominantChunkProvider,
} from '../provider/chunked-route.util';
import type { TranscriptionStep } from '../provider/transcription-route.util';
import { transcriptionCallKey } from '../provider/yandex-call-input.util';

/**
 * Правила резки длинного звонка в маршрутизаторе (19.11.2026): попытки на
 * кусок, ключ куска для стража Яндекса, распознаватель звонка по секундам.
 */
const YANDEX: TranscriptionStep = { provider: 'yandex', model: null };
const VIBECODE: TranscriptionStep = {
    provider: 'bitrix-vibecode',
    model: null,
};
const WHISPER: TranscriptionStep = { provider: 'local-whisper', model: null };

describe('chunkAttemptSteps', () => {
    it('план длинных «Яндекс → Vibecode → свой Whisper» — на кусок Яндекс последним', () => {
        expect(chunkAttemptSteps([YANDEX, VIBECODE, WHISPER], true)).toEqual([
            VIBECODE,
            WHISPER,
            YANDEX,
        ]);
    });

    it('свой Whisper без адреса выпадает', () => {
        expect(chunkAttemptSteps([WHISPER, YANDEX, VIBECODE], false)).toEqual([
            VIBECODE,
            YANDEX,
        ]);
    });

    it('бесплатных нет — пусто: резать незачем', () => {
        expect(chunkAttemptSteps([YANDEX], true)).toEqual([]);
        expect(chunkAttemptSteps([WHISPER, YANDEX], false)).toEqual([]);
    });

    it('без Яндекса в плане — только бесплатные, в порядке плана', () => {
        expect(chunkAttemptSteps([WHISPER, VIBECODE], true)).toEqual([
            WHISPER,
            VIBECODE,
        ]);
    });

    it('Яндекс — одна попытка, даже если в плане он дважды; модели Vibecode — каждая своя', () => {
        const fast: TranscriptionStep = {
            provider: 'bitrix-vibecode',
            model: 'fast',
        };
        const yandexModel: TranscriptionStep = {
            provider: 'yandex',
            model: 'general',
        };
        expect(
            chunkAttemptSteps([YANDEX, fast, yandexModel, VIBECODE], false),
        ).toEqual([fast, VIBECODE, YANDEX]);
    });
});

describe('chunkCallKey', () => {
    it('ключ куска — {callKey}:partNNofMM, номер с единицы', () => {
        expect(
            chunkCallKey('gsr.bitrix24.ru:777', { index: 1, count: 5 }),
        ).toBe('gsr.bitrix24.ru:777:part02of05');
        expect(chunkCallKey('k', { index: 11, count: 12 })).toBe(
            'k:part12of12',
        );
    });
});

describe('dominantChunkProvider', () => {
    const attempts = [VIBECODE, WHISPER, YANDEX];

    it('больше секунд у Vibecode — звонок за Vibecode', () => {
        expect(
            dominantChunkProvider({ Vibecode: 600, Yandex: 300 }, attempts),
        ).toBe('bitrix-vibecode');
    });

    it('больше секунд у Яндекса — звонок за Яндексом', () => {
        expect(
            dominantChunkProvider({ Vibecode: 125, Yandex: 195 }, attempts),
        ).toBe('yandex');
    });

    it('секунды разных моделей одного распознавателя складываются', () => {
        expect(
            dominantChunkProvider(
                {
                    'Vibecode (fast)': 200,
                    'Vibecode (precise)': 200,
                    Yandex: 300,
                },
                attempts,
            ),
        ).toBe('bitrix-vibecode');
    });

    it('равенство — раньше стоящий в попытках (бесплатный)', () => {
        expect(
            dominantChunkProvider({ Yandex: 300, Vibecode: 300 }, attempts),
        ).toBe('bitrix-vibecode');
    });

    it('чужие имена не считаются; пусто — первый в попытках', () => {
        expect(
            dominantChunkProvider(
                { Чужой: 1000, 'свой Whisper (large-v3)': 10 },
                attempts,
            ),
        ).toBe('local-whisper');
        expect(dominantChunkProvider({}, attempts)).toBe('bitrix-vibecode');
    });
});

describe('chunkProvidersLine', () => {
    it('«Vibecode 11, Yandex 1»', () => {
        expect(chunkProvidersLine({ Vibecode: 11, Yandex: 1 })).toBe(
            'Vibecode 11, Yandex 1',
        );
    });
});

describe('transcriptionCallKey', () => {
    it('dedupKey конвейера — как есть; без него — хэш записи, одинаковый для той же записи', () => {
        const call = { domain: 'd.ru', buffer: Buffer.from('audio') };
        expect(transcriptionCallKey({ ...call, callKey: 'd.ru:1' })).toBe(
            'd.ru:1',
        );
        const key = transcriptionCallKey(call);
        expect(key).toMatch(/^d\.ru:file:[0-9a-f]{40}$/);
        expect(transcriptionCallKey({ ...call })).toBe(key);
    });
});
