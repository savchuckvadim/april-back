import {
    STEREO_ECHO_MIN_WORDS,
    detectStereoEcho,
} from '../lib/stereo-echo.util';
import { inChannel, numberedPhrase, timedWords } from './stereo-chunks.fixture';

/**
 * Стерео «двойное моно» (gsr 18.11.2026): оба канала — весь разговор,
 * Яндекс отдаёт каждое слово дважды с тем же временем. Проверяем порог
 * доли двойников, допуск по времени, нормализацию текста и случаи, когда
 * решение не принимаем.
 */
const manager = timedWords(numberedPhrase('менеджер', 25), 0, '1');
const client = timedWords(numberedPhrase('клиент', 25), 20, '2');

describe('detectStereoEcho — стерео «двойное моно»', () => {
    it('одинаковые каналы — оставляем канал 1, совпало 100 %; порядок слов не важен', () => {
        const words = [...manager, ...inChannel(manager, '2')];

        expect(detectStereoEcho(words)).toEqual({
            keepChannel: '1',
            matchedShare: 1,
        });
        expect(detectStereoEcho([...words].reverse())).toEqual({
            keepChannel: '1',
            matchedShare: 1,
        });
    });

    it('во втором канале слов больше — оставляем его, долю считаем по меньшему', () => {
        const tail = timedWords(numberedPhrase('хвост', 5), 30, '2');

        expect(
            detectStereoEcho([...manager, ...inChannel(manager, '2'), ...tail]),
        ).toEqual({ keepChannel: '2', matchedShare: 1 });
    });

    it('регистр и ё не мешают: «Ещё» и «еще» — двойники', () => {
        const words = timedWords(`Ещё ${numberedPhrase('Слово', 24)}`, 0);
        const echo = inChannel(words, '2').map(word => ({
            ...word,
            word: word.word.toLowerCase().replace(/ё/g, 'е'),
        }));

        expect(detectStereoEcho([...words, ...echo])?.matchedShare).toBe(1);
    });

    it('начало разошлось не больше чем на 0,1 с — двойник, дальше — нет', () => {
        expect(
            detectStereoEcho([...manager, ...inChannel(manager, '2', 0.1)])
                ?.matchedShare,
        ).toBe(1);
        expect(
            detectStereoEcho([...manager, ...inChannel(manager, '2', -0.1)])
                ?.matchedShare,
        ).toBe(1);
        expect(
            detectStereoEcho([...manager, ...inChannel(manager, '2', 0.15)]),
        ).toBeNull();
    });

    it('порог 80 %: 20 из 25 слов с двойником — двойное моно, 19 из 25 — нет', () => {
        const echoOf = (twins: number) => [
            ...inChannel(manager.slice(0, twins), '2'),
            ...timedWords(numberedPhrase('своё', 25 - twins), 40, '2'),
        ];

        expect(detectStereoEcho([...manager, ...echoOf(20)])).toEqual({
            keepChannel: '1',
            matchedShare: 0.8,
        });
        expect(detectStereoEcho([...manager, ...echoOf(19)])).toBeNull();
    });

    it('раздельное стерео и частичное эхо (≈30 %) — каналы разные', () => {
        const echo = [...inChannel(manager.slice(0, 8), '2'), ...client];

        expect(detectStereoEcho([...manager, ...client])).toBeNull();
        expect(detectStereoEcho([...manager, ...echo])).toBeNull();
    });

    it(`меньше ${STEREO_ECHO_MIN_WORDS} слов в канале — решение не принимаем`, () => {
        const short = manager.slice(0, STEREO_ECHO_MIN_WORDS - 1);
        const enough = manager.slice(0, STEREO_ECHO_MIN_WORDS);

        expect(
            detectStereoEcho([...short, ...inChannel(short, '2')]),
        ).toBeNull();
        expect(
            detectStereoEcho([...short, ...inChannel(manager, '2')]),
        ).toBeNull();
        expect(
            detectStereoEcho([...enough, ...inChannel(enough, '2')]),
        ).not.toBeNull();
    });

    it('моно, один канал, три канала, пустой ответ — null', () => {
        expect(
            detectStereoEcho(timedWords(numberedPhrase('слово', 30), 0, null)),
        ).toBeNull();
        expect(detectStereoEcho(manager)).toBeNull();
        expect(
            detectStereoEcho([
                ...manager,
                ...inChannel(manager, '2'),
                ...inChannel(manager, '3'),
            ]),
        ).toBeNull();
        expect(detectStereoEcho([])).toBeNull();
    });
});
