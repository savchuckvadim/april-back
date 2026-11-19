import { parseMp3FrameHeader, scanMp3Frames } from '../mp3-frames.util';
import { splitMp3, type Mp3Chunk } from '../mp3-split.util';
import {
    PHONE_FRAME_BYTES,
    PHONE_FRAME_SEC,
    frameIndexAt,
    frameIndexes,
    id3Tag,
    mpeg1Frame,
    phoneFrame,
    phoneInfoFrame,
    phoneMp3,
} from './mp3.fixture';

const range = (from: number, to: number): number[] =>
    Array.from({ length: to - from }, (_value, index) => from + index);

/** Кадры куска идут подряд от первого до последнего. */
const expectWholeFrames = (chunk: Mp3Chunk): void => {
    expect(chunk.buffer.length % PHONE_FRAME_BYTES).toBe(0);
    const indexes = frameIndexes(chunk.buffer);
    const first = indexes[0];
    expect(indexes).toEqual(range(first, first + indexes.length));
    expect(chunk.startSec).toBeCloseTo(first * PHONE_FRAME_SEC, 6);
    expect(chunk.endSec).toBeCloseTo(
        (first + indexes.length) * PHONE_FRAME_SEC,
        6,
    );
};

describe('parseMp3FrameHeader', () => {
    it('длина кадра по битрейту, частоте и padding; сэмплов — по версии MPEG', () => {
        expect(parseMp3FrameHeader(phoneFrame(0), 0)).toEqual({
            version: 'mpeg25',
            sampleRate: 8000,
            samplesPerFrame: 576,
            length: 72,
            mono: true,
            crc: false,
        });
        expect(parseMp3FrameHeader(mpeg1Frame(false), 0)).toMatchObject({
            version: 'mpeg1',
            sampleRate: 44100,
            samplesPerFrame: 1152,
            length: 417,
            mono: false,
        });
        expect(parseMp3FrameHeader(mpeg1Frame(true), 0)?.length).toBe(418);
    });

    it('Layer II, зарезервированная версия и битрейт 1111 — не кадр', () => {
        expect(
            parseMp3FrameHeader(Buffer.from([0xff, 0xfd, 0x90, 0x00]), 0),
        ).toBeNull();
        expect(
            parseMp3FrameHeader(Buffer.from([0xff, 0xeb, 0x90, 0x00]), 0),
        ).toBeNull();
        expect(
            parseMp3FrameHeader(Buffer.from([0xff, 0xfb, 0xf0, 0x00]), 0),
        ).toBeNull();
    });
});

describe('scanMp3Frames', () => {
    it('кадры с padding идут каждый своей длиной', () => {
        const buffer = Buffer.concat([
            mpeg1Frame(false),
            mpeg1Frame(true),
            mpeg1Frame(false),
            mpeg1Frame(true),
        ]);
        const map = scanMp3Frames(buffer);
        expect(map?.lengths).toEqual([417, 418, 417, 418]);
        expect(map?.offsets).toEqual([0, 417, 835, 1252]);
        expect(map?.frameSec).toBeCloseTo(1152 / 44100, 9);
    });

    it('мусор внутри потока, тег в хвосте и обрезанный последний кадр отбрасываются', () => {
        const buffer = Buffer.concat([
            phoneMp3(5),
            Buffer.alloc(13, 0x00),
            phoneFrame(5),
            phoneFrame(6),
            phoneFrame(7),
            phoneFrame(8).subarray(0, 40),
        ]);
        const map = scanMp3Frames(buffer);
        expect(
            map?.offsets.map(offset => frameIndexAt(buffer, offset)),
        ).toEqual(range(0, 8));

        const tagged = Buffer.concat([
            phoneMp3(4),
            Buffer.concat([Buffer.from('TAG', 'latin1'), Buffer.alloc(125)]),
        ]);
        expect(scanMp3Frames(tagged)?.offsets).toHaveLength(4);
    });
});

describe('splitMp3', () => {
    it('режет только между кадрами, соседние куски перекрываются на нахлёст', () => {
        // 2500 кадров по 72 мс = 180 с: три куска по минуте.
        const chunks = splitMp3(phoneMp3(2500), {
            chunkSec: 60,
            overlapSec: 5,
        });

        expect(chunks?.map(chunk => chunk.index)).toEqual([0, 1, 2]);
        for (const chunk of chunks ?? []) expectWholeFrames(chunk);
        expect(chunks?.map(chunk => frameIndexAt(chunk.buffer))).toEqual([
            0, 833, 1666,
        ]);
        expect(chunks?.map(chunk => chunk.startSec)).toEqual([
            0, 59.976, 119.952,
        ]);
        expect(chunks?.map(chunk => chunk.endSec)).toEqual([
            65.016, 125.064, 180,
        ]);
        // Нахлёст не меньше заданного: граница кадра округляет наружу.
        const [first, second, third] = chunks ?? [];
        expect(first.endSec - second.startSec).toBeGreaterThanOrEqual(5);
        expect(second.endSec - third.startSec).toBeGreaterThanOrEqual(5);
        // Последний кусок — до конца записи.
        expect(frameIndexes(third.buffer).at(-1)).toBe(2499);
    });

    it('хвост короче трети куска приклеивается к предыдущему', () => {
        // 1806 кадров ≈ 130 с: хвост 10 с < 20 с — два куска, второй до конца.
        const chunks = splitMp3(phoneMp3(1806), {
            chunkSec: 60,
            overlapSec: 5,
        });

        expect(chunks).toHaveLength(2);
        expect(chunks?.[1].startSec).toBe(59.976);
        expect(chunks?.[1].endSec).toBe(130.032);
        expect(frameIndexes(chunks?.[1].buffer ?? Buffer.alloc(0)).at(-1)).toBe(
            1805,
        );
    });

    it('хвост от трети куска остаётся своим куском', () => {
        // 1945 кадров ≈ 140 с: хвост 20 с — третий кусок.
        const chunks = splitMp3(phoneMp3(1945), {
            chunkSec: 60,
            overlapSec: 5,
        });
        expect(chunks).toHaveLength(3);
    });

    it('запись короче куска — один кусок целиком', () => {
        const chunks = splitMp3(phoneMp3(100), { chunkSec: 60, overlapSec: 5 });
        expect(chunks).toHaveLength(1);
        expect(chunks?.[0].buffer.length).toBe(100 * PHONE_FRAME_BYTES);
        expect(chunks?.[0].endSec).toBe(7.2);
    });

    it('тег ID3 и кадр-заголовок Info в куски не попадают', () => {
        const buffer = Buffer.concat([
            id3Tag(40),
            phoneInfoFrame(),
            phoneMp3(30),
        ]);
        const chunks = splitMp3(buffer, { chunkSec: 60, overlapSec: 5 });

        expect(chunks).toHaveLength(1);
        expect(chunks?.[0].buffer.subarray(0, 3).toString('latin1')).not.toBe(
            'ID3',
        );
        expect(frameIndexes(chunks?.[0].buffer ?? Buffer.alloc(0))).toEqual(
            range(0, 30),
        );
        expect(chunks?.[0].startSec).toBe(0);
    });

    it('мусор между кадрами в кусок не попадает', () => {
        const buffer = Buffer.concat([
            phoneMp3(10),
            Buffer.alloc(7, 0x00),
            ...range(10, 20).map(index => phoneFrame(index)),
        ]);
        const chunks = splitMp3(buffer, { chunkSec: 60, overlapSec: 5 });
        expect(frameIndexes(chunks?.[0].buffer ?? Buffer.alloc(0))).toEqual(
            range(0, 20),
        );
    });

    it('не MP3, пустой буфер, меньше трёх кадров подряд — null', () => {
        const options = { chunkSec: 60, overlapSec: 5 };
        expect(splitMp3(Buffer.from('RIFF....WAVEfmt '), options)).toBeNull();
        expect(splitMp3(Buffer.alloc(0), options)).toBeNull();
        expect(splitMp3(phoneMp3(2), options)).toBeNull();
        expect(splitMp3(Buffer.alloc(5000, 0xff), options)).toBeNull();
    });

    it('кусок не больше нуля или нахлёст от половины куска — ошибка вызывающего', () => {
        expect(() =>
            splitMp3(phoneMp3(10), { chunkSec: 0, overlapSec: 0 }),
        ).toThrow(RangeError);
        expect(() =>
            splitMp3(phoneMp3(10), { chunkSec: 60, overlapSec: 30 }),
        ).toThrow(RangeError);
        expect(() =>
            splitMp3(phoneMp3(10), { chunkSec: 60, overlapSec: -1 }),
        ).toThrow(RangeError);
    });
});
