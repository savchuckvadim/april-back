import type { TranscriptSegment } from '../../types/transcript-segment.types';
import {
    stitchChunkTranscripts,
    type RecognizedChunk,
} from '../chunk-stitch.util';

const segment = (
    startSec: number,
    endSec: number,
    text: string,
): TranscriptSegment => ({ startSec, endSec, speaker: 'unknown', text });

/** Кусок с сегментами, заданными в секундах ЗАПИСИ (спека сама сдвигает их к началу куска). */
const timedChunk = (
    startSec: number,
    endSec: number,
    absolute: readonly TranscriptSegment[],
): RecognizedChunk => ({
    startSec,
    endSec,
    text: absolute.map(item => item.text).join(' '),
    segments: absolute.map(item => ({
        ...item,
        startSec: Math.round((item.startSec - startSec) * 100) / 100,
        endSec: Math.round((item.endSec - startSec) * 100) / 100,
    })),
});

const untimedChunk = (
    startSec: number,
    endSec: number,
    text: string,
): RecognizedChunk => ({ startSec, endSec, text, segments: null });

const texts = (segments: readonly TranscriptSegment[] | null): string[] =>
    (segments ?? []).map(item => item.text);

/**
 * Два куска: [0, 65] и [60, 125], нахлёст 60–65 с, граница — 62,5 с.
 */
describe('stitchChunkTranscripts', () => {
    it('сегменты сдвигаются на начало куска', () => {
        const result = stitchChunkTranscripts([
            {
                startSec: 59.976,
                endSec: 125,
                text: 'добрый день',
                segments: [segment(1, 2.5, 'добрый день')],
            },
        ]);
        expect(result.segments).toEqual([segment(60.98, 62.48, 'добрый день')]);
        expect(result.untimed).toBe(false);
    });

    it('фраза внутри нахлёста — один раз, без потерь вокруг', () => {
        const shared = segment(60.5, 61.5, 'алло слышно меня');
        const result = stitchChunkTranscripts([
            timedChunk(0, 65, [
                segment(10, 20, 'первая фраза'),
                shared,
                segment(63.5, 64.9, 'обрезанное нача'),
            ]),
            timedChunk(60, 125, [
                segment(60.1, 60.4, 'шум'),
                shared,
                segment(63.5, 66, 'обрезанное начало фразы'),
                segment(100, 110, 'последняя фраза'),
            ]),
        ]);

        expect(texts(result.segments)).toEqual([
            'первая фраза',
            'алло слышно меня',
            'обрезанное начало фразы',
            'последняя фраза',
        ]);
        expect(result.text).toBe(
            'первая фраза алло слышно меня обрезанное начало фразы последняя фраза',
        );
    });

    it('фраза у самой границы с разъехавшимися таймкодами не теряется и не двоится', () => {
        // Слева середина 62,6 (правее границы 62,5), справа — 62,4 (левее):
        // строгая граница отдала бы фразу соседу в обоих кусках.
        const result = stitchChunkTranscripts([
            timedChunk(0, 65, [
                segment(30, 40, 'до стыка'),
                segment(61.2, 64, 'давайте назначим встречу на четверг'),
            ]),
            timedChunk(60, 125, [
                segment(61, 63.8, 'давайте назначим встречу на четверг'),
                segment(70, 80, 'после стыка'),
            ]),
        ]);

        expect(texts(result.segments)).toEqual([
            'до стыка',
            'давайте назначим встречу на четверг',
            'после стыка',
        ]);
    });

    it('короткая фраза у границы в обоих кусках — один раз', () => {
        const result = stitchChunkTranscripts([
            timedChunk(0, 65, [segment(62, 63, 'да конечно')]),
            timedChunk(60, 125, [
                segment(62.1, 63.1, 'да конечно'),
                segment(70, 71, 'дальше'),
            ]),
        ]);
        expect(texts(result.segments)).toEqual(['да конечно', 'дальше']);
    });

    it('кусок без таймкодов — его текст целиком без повтора на стыке, звонок «без таймкодов»', () => {
        const result = stitchChunkTranscripts([
            timedChunk(0, 65, [
                segment(10, 20, 'первая фраза'),
                segment(59, 62, 'мы обсудили цену и сроки поставки'),
            ]),
            untimedChunk(
                60,
                125,
                'цену и сроки поставки до конца месяца и всё',
            ),
        ]);

        expect(result.untimed).toBe(true);
        expect(result.text).toBe(
            'первая фраза мы обсудили цену и сроки поставки до конца месяца и всё',
        );
        // Кусок без таймкодов — одним сегментом на свою зону (от границы 62,5 с).
        expect(result.segments?.at(-1)).toEqual(
            segment(62.5, 125, 'цену и сроки поставки до конца месяца и всё'),
        );
    });

    it('ни одного куска с таймкодами — сегментов нет, текст склеен без повтора', () => {
        const result = stitchChunkTranscripts([
            untimedChunk(0, 65, 'начало мы обсудили цену и сроки поставки'),
            untimedChunk(60, 125, 'цену и сроки поставки до конца месяца'),
        ]);
        expect(result).toEqual({
            text: 'начало мы обсудили цену и сроки поставки до конца месяца',
            segments: null,
            untimed: true,
        });
    });

    it('тихий кусок пропускается, куски в любом порядке', () => {
        const result = stitchChunkTranscripts([
            timedChunk(120, 180, [segment(150, 151, 'третий')]),
            { startSec: 60, endSec: 125, text: '  ', segments: null },
            timedChunk(0, 65, [segment(10, 11, 'первый')]),
        ]);
        expect(result.text).toBe('первый третий');
        expect(result.untimed).toBe(false);
    });

    it('пустой ввод — пустой текст без сегментов', () => {
        expect(stitchChunkTranscripts([])).toEqual({
            text: '',
            segments: null,
            untimed: false,
        });
    });
});
