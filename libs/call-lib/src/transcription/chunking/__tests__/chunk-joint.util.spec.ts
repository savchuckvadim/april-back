import type { TranscriptSegment } from '../../types/transcript-segment.types';
import {
    findRepeatedJoint,
    normalizeWord,
    trimJointRepeat,
} from '../chunk-joint.util';

const words = (text: string): string[] =>
    text.split(' ').map(word => normalizeWord(word));

const segment = (
    startSec: number,
    endSec: number,
    text: string,
): TranscriptSegment => ({ startSec, endSec, speaker: 'unknown', text });

describe('findRepeatedJoint', () => {
    it('начало правого текста найдено в хвосте левого — повтор с этого слова', () => {
        const tail = words('мы обсудили цену и сроки поставки до конца месяца');
        const head = words('цену и сроки поставки до конца месяца хорошо');
        expect(findRepeatedJoint(tail, head)).toEqual({
            tailFrom: 2,
            headFrom: 0,
        });
    });

    it('обрезанные первые слова справа пропускаются', () => {
        const tail = words('мы обсудили цену и сроки поставки');
        const head = words('ну цену и сроки поставки до');
        expect(findRepeatedJoint(tail, head)).toEqual({
            tailFrom: 2,
            headFrom: 1,
        });
    });

    it('регистр, знаки препинания и ё не мешают', () => {
        const tail = words('Да. Всё, ещё раз: Цена ВЕРНАЯ');
        const head = words('все еще раз цена верная');
        expect(findRepeatedJoint(tail, head)?.tailFrom).toBe(1);
    });

    it('короткий повтор — только если это весь текст справа в самом конце левого', () => {
        expect(
            findRepeatedJoint(words('хорошо да конечно'), words('да конечно')),
        ).toEqual({ tailFrom: 1, headFrom: 0 });
        // «да конечно» в середине хвоста — не стык, а совпадение.
        expect(
            findRepeatedJoint(
                words('да конечно пришлите счёт'),
                words('да конечно'),
            ),
        ).toBeNull();
        // Справа есть продолжение — трёх слов для стыка мало.
        expect(
            findRepeatedJoint(
                words('мы с вами да конечно'),
                words('да конечно пришлите счёт сегодня'),
            ),
        ).toBeNull();
    });

    it('без общего начала — null', () => {
        expect(
            findRepeatedJoint(
                words('один два три четыре'),
                words('пять шесть'),
            ),
        ).toBeNull();
        expect(findRepeatedJoint([], words('пять шесть'))).toBeNull();
    });
});

describe('trimJointRepeat', () => {
    it('без таймкодов: хвост слева, повторённый справа, отрезается', () => {
        const left = [
            segment(
                0,
                65,
                'начало разговора мы обсудили цену и сроки поставки',
            ),
        ];
        const right = [
            segment(60, 120, 'цену и сроки поставки до конца месяца'),
        ];

        expect(
            trimJointRepeat(left, right, { bothTimed: false, overlapSec: 5 }),
        ).toEqual({
            left: [segment(0, 65, 'начало разговора мы обсудили')],
            right,
        });
    });

    it('с таймкодами сравниваются только сегменты, пересекающиеся по времени', () => {
        const left = [
            segment(50, 55, 'цену и сроки поставки обсудим позже'),
            segment(60.5, 63, 'пришлите пожалуйста счёт сегодня'),
        ];
        const right = [
            segment(60.6, 63.1, 'пришлите пожалуйста счёт сегодня'),
            segment(64, 66, 'цену и сроки поставки'),
        ];
        const result = trimJointRepeat(left, right, {
            bothTimed: true,
            overlapSec: 5,
        });
        expect(result.left).toEqual([left[0]]);
        expect(result.right).toEqual(right);
    });

    it('сегменты, не пересекающиеся по времени, не трогаются', () => {
        const left = [segment(55, 59, 'пришлите пожалуйста счёт сегодня')];
        const right = [segment(61, 63, 'пришлите пожалуйста счёт сегодня')];
        expect(
            trimJointRepeat(left, right, { bothTimed: true, overlapSec: 5 }),
        ).toEqual({ left, right });
    });

    it('нет нахлёста — нет и повтора', () => {
        const left = [segment(0, 60, 'один два три четыре пять')];
        const right = [segment(60, 120, 'один два три четыре пять')];
        expect(
            trimJointRepeat(left, right, { bothTimed: false, overlapSec: 0 }),
        ).toEqual({ left, right });
    });
});
