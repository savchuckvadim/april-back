import { Readable } from 'node:stream';
import {
    ByteWindow,
    parseRangeHeader,
    planAudioResponse,
    rangeHeaderOf,
    type AudioUpstream,
} from '../call-page-audio.util';
import { buildCallPageTranscript } from '../call-page-transcript.util';

const upstream = (fields: Partial<AudioUpstream>): AudioUpstream => ({
    status: 200,
    contentLength: null,
    contentRange: null,
    contentType: null,
    ...fields,
});

async function windowed(
    chunks: readonly string[],
    skip: number,
    take: number | null,
): Promise<string> {
    const parts: Buffer[] = [];
    const stream = Readable.from(chunks.map(chunk => Buffer.from(chunk))).pipe(
        new ByteWindow(skip, take),
    );
    for await (const part of stream) parts.push(part as Buffer);
    return Buffer.concat(parts).toString();
}

describe('запись разговора: перемотка', () => {
    it('заголовок Range: один кусок, остальное — весь файл', () => {
        expect(parseRangeHeader('bytes=100-')).toEqual({
            start: 100,
            end: null,
        });
        expect(parseRangeHeader('bytes=100-199')).toEqual({
            start: 100,
            end: 199,
        });
        expect(parseRangeHeader(undefined)).toBeNull();
        expect(parseRangeHeader('bytes=-500')).toBeNull();
        expect(parseRangeHeader('bytes=0-10,20-30')).toBeNull();
        expect(parseRangeHeader('bytes=200-100')).toBeNull();
        expect(rangeHeaderOf({ start: 100, end: null })).toBe('bytes=100-');
        expect(rangeHeaderOf({ start: 100, end: 199 })).toBe('bytes=100-199');
    });

    it('источник сам отдал кусок — пересылаем как есть', () => {
        const plan = planAudioResponse(
            upstream({
                status: 206,
                contentLength: 100,
                contentRange: 'bytes 100-199/1000',
                contentType: 'audio/mpeg',
            }),
            { start: 100, end: 199 },
        );
        expect(plan).toMatchObject({ status: 206, skip: 0, take: null });
        expect(plan.headers['Content-Range']).toBe('bytes 100-199/1000');
        expect(plan.headers['Content-Length']).toBe('100');
    });

    it('кусок не просили — файл целиком', () => {
        const plan = planAudioResponse(
            upstream({
                contentLength: 1000,
                contentType: 'application/octet-stream',
            }),
            null,
        );
        expect(plan).toMatchObject({ status: 200, skip: 0, take: null });
        expect(plan.headers).toMatchObject({
            'Content-Type': 'audio/mpeg',
            'Content-Length': '1000',
            'Accept-Ranges': 'bytes',
        });
    });

    it('источник прислал файл целиком — кусок вырезаем сами', () => {
        const middle = planAudioResponse(upstream({ contentLength: 1000 }), {
            start: 100,
            end: 199,
        });
        expect(middle).toMatchObject({ status: 206, skip: 100, take: 100 });
        expect(middle.headers['Content-Range']).toBe('bytes 100-199/1000');

        const tail = planAudioResponse(upstream({ contentLength: 1000 }), {
            start: 900,
            end: null,
        });
        expect(tail).toMatchObject({ status: 206, skip: 900, take: 100 });
        expect(tail.headers['Content-Range']).toBe('bytes 900-999/1000');

        const beyond = planAudioResponse(upstream({ contentLength: 1000 }), {
            start: 500,
            end: 5000,
        });
        expect(beyond.headers['Content-Range']).toBe('bytes 500-999/1000');
    });

    it('кусок за концом файла — 416; размер неизвестен — файл целиком', () => {
        const outside = planAudioResponse(upstream({ contentLength: 1000 }), {
            start: 1000,
            end: null,
        });
        expect(outside.status).toBe(416);
        expect(outside.headers['Content-Range']).toBe('bytes */1000');

        expect(
            planAudioResponse(upstream({}), { start: 100, end: null }),
        ).toMatchObject({ status: 200, skip: 0, take: null });
    });

    it('окно: пропускает начало и отдаёт нужное число байт через границы кусков', async () => {
        expect(await windowed(['abc', 'def', 'ghi'], 2, 5)).toBe('cdefg');
        expect(await windowed(['abc', 'def', 'ghi'], 0, 2)).toBe('ab');
        expect(await windowed(['abc', 'def', 'ghi'], 7, null)).toBe('hi');
        expect(await windowed(['abc'], 10, 5)).toBe('');
    });
});

describe('расшифровка для страницы звонка', () => {
    it('сегменты с таймкодами — основной источник; пустые реплики отброшены', () => {
        const transcript = buildCallPageTranscript(
            {
                segments: [
                    {
                        startSec: 0,
                        endSec: 3,
                        speaker: 'manager',
                        text: ' Алло ',
                    },
                    { startSec: 3, endSec: 4, speaker: 'unknown', text: '  ' },
                    {
                        startSec: 4,
                        endSec: 7,
                        speaker: 'client',
                        text: 'Слушаю',
                    },
                ],
                text: 'Алло Слушаю',
            },
            [{ role: 'manager', text: 'из диалога' }],
        );
        expect(transcript.timed).toBe(true);
        expect(transcript.segments).toEqual([
            {
                index: 0,
                startSec: 0,
                endSec: 3,
                speaker: 'manager',
                text: 'Алло',
            },
            {
                index: 1,
                startSec: 4,
                endSec: 7,
                speaker: 'client',
                text: 'Слушаю',
            },
        ]);
    });

    it('сегментов нет — диалог по ролям из разбора', () => {
        const transcript = buildCallPageTranscript(
            { segments: null, text: 'Алло Слушаю' },
            [
                { role: 'manager', text: 'Алло' },
                { role: 'other', text: 'Шум' },
            ],
        );
        expect(transcript.timed).toBe(false);
        expect(transcript.segments.map(item => item.speaker)).toEqual([
            'manager',
            null,
        ]);
    });

    it('нет ни сегментов, ни диалога — текст абзацами, длинный режется по предложениям', () => {
        const sentence =
            'Это довольно длинное предложение разговора номер один.';
        const long = Array.from({ length: 12 }, () => sentence).join(' ');
        const transcript = buildCallPageTranscript(
            { segments: [], text: `Короткий абзац.\n\n${long}` },
            [],
        );
        expect(transcript.timed).toBe(false);
        expect(transcript.segments[0].text).toBe('Короткий абзац.');
        expect(transcript.segments.length).toBeGreaterThan(2);
        expect(
            transcript.segments.every(segment => segment.text.length <= 320),
        ).toBe(true);
        expect(
            transcript.segments
                .slice(1)
                .map(segment => segment.text)
                .join(' '),
        ).toBe(long);
    });

    it('пустой текст — пустая расшифровка', () => {
        expect(
            buildCallPageTranscript({ segments: null, text: null }, []),
        ).toEqual({ segments: [], timed: false });
    });
});
