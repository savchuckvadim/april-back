import { prepareTranscript } from '../long-call-input-lines.util';
import type { LineRange } from '../long-call-input.types';
import {
    eventWindowCandidates,
    summaryWindowCandidates,
} from '../long-call-input-windows.util';
import {
    emptyWindows,
    flatEventOf,
    summaryOf,
    timedLine,
    uniformLines,
} from './long-call-input.fixture';

/** 60 строк по 100 знаков, метки каждые 10 секунд: строка i звучит на секунде 10·i. */
const prepared = prepareTranscript(uniformLines(60).join('\n'));
const NO_PARTS: ReadonlyMap<number, LineRange> = new Map();

describe('summaryWindowCandidates — отрезки сводки', () => {
    const windows = emptyWindows();
    windows.form = [{ fromSec: 0, toSec: 30, why: 'вход в разговор' }];
    windows.movement = [
        { fromSec: 200, toSec: 260, why: 'торг по цене' },
        { fromSec: 9_000, toSec: 9_100, why: 'вне записи' },
    ];
    windows.closing = [{ fromSec: 500, toSec: 540, why: 'договорились' }];
    const summary = summaryOf({ windows });

    it('берёт отрезки только своих направлений: строки, чьё время попало в отрезок', () => {
        const candidates = summaryWindowCandidates(prepared, summary, [
            'movement',
        ]);

        expect(candidates).toHaveLength(1);
        expect(candidates[0]).toMatchObject({
            source: 'window',
            range: { from: 20, to: 26 },
            reason: 'торг по цене',
            heading: '03:20–04:20: торг по цене',
            span: { fromSec: 200, toSec: 260 },
        });
    });

    it('у «целиком» — отрезки всех направлений', () => {
        const candidates = summaryWindowCandidates(prepared, summary, [
            'form',
            'content',
            'movement',
            'closing',
            'methodology',
        ]);

        expect(candidates.map(candidate => candidate.reason)).toEqual([
            'вход в разговор',
            'торг по цене',
            'договорились',
        ]);
    });

    it('отрезок без строк записи кандидатов не даёт', () => {
        expect(
            summaryWindowCandidates(prepared, summary, ['movement']).map(
                candidate => candidate.reason,
            ),
        ).not.toContain('вне записи');
    });

    it('сводки нет — кандидатов нет', () => {
        expect(summaryWindowCandidates(prepared, null, ['form'])).toEqual([]);
    });

    it('запись без меток: отрезки по времени ничего не выбирают', () => {
        const plain = prepareTranscript('Алло.\nДа, слушаю.');

        expect(summaryWindowCandidates(plain, summary, ['form'])).toEqual([]);
    });
});

describe('eventWindowCandidates — окна вокруг событий', () => {
    const events = [
        flatEventOf({ kind: 'objection', startSec: 300, quote: 'дорого' }),
        flatEventOf({ kind: 'need', startSec: 100, quote: 'нужен учёт' }),
        flatEventOf({ kind: 'price', startSec: 400, quote: 'сто тысяч' }),
    ];

    it('берёт события только нужных видов', () => {
        const candidates = eventWindowCandidates(
            prepared,
            events,
            ['objection', 'price'],
            0,
            NO_PARTS,
        );

        expect(candidates.map(candidate => candidate.reason)).toEqual([
            'возражение',
            'цена',
        ]);
    });

    it('радиус по времени сужается по ступеням 45, 30 и 15 секунд', () => {
        const rangeAt = (step: number) =>
            eventWindowCandidates(prepared, events, ['need'], step, NO_PARTS)[0]
                .range;

        expect(rangeAt(0)).toEqual({ from: 6, to: 14 });
        expect(rangeAt(1)).toEqual({ from: 7, to: 13 });
        expect(rangeAt(2)).toEqual({ from: 9, to: 11 });
    });

    it('ступеней меньше, чем запрошено, — берётся самая узкая', () => {
        const [candidate] = eventWindowCandidates(
            prepared,
            events,
            ['need'],
            7,
            NO_PARTS,
        );

        expect(candidate.range).toEqual({ from: 9, to: 11 });
    });

    it('заголовок и время события', () => {
        const [candidate] = eventWindowCandidates(
            prepared,
            events,
            ['need'],
            0,
            NO_PARTS,
        );

        expect(candidate).toMatchObject({
            source: 'event',
            reason: 'потребность',
            heading: '01:40, потребность',
            span: { fromSec: 100, toSec: 100 },
        });
    });

    it('у события без времени окно по цитате, радиус в знаках: 600, 400, 200', () => {
        const noTime = [
            flatEventOf({ kind: 'need', startSec: null, quote: 'Р30' }),
        ];
        const rangeAt = (step: number) =>
            eventWindowCandidates(prepared, noTime, ['need'], step, NO_PARTS)[0]
                .range;

        expect(rangeAt(0)).toEqual({ from: 25, to: 35 });
        expect(rangeAt(1)).toEqual({ from: 27, to: 33 });
        expect(rangeAt(2)).toEqual({ from: 29, to: 31 });
        expect(
            eventWindowCandidates(prepared, noTime, ['need'], 0, NO_PARTS)[0],
        ).toMatchObject({ heading: 'потребность', span: null });
    });

    it('цитата не найдена — окна нет', () => {
        const lost = [
            flatEventOf({ kind: 'need', startSec: null, quote: 'нет такой' }),
        ];

        expect(
            eventWindowCandidates(prepared, lost, ['need'], 0, NO_PARTS),
        ).toEqual([]);
    });

    it('в окне по времени нет строк — ищем строку по цитате', () => {
        const sparse = prepareTranscript(
            [
                '[00:00] начало',
                '[10:00] середина про цену',
                '[20:00] конец',
            ].join('\n'),
        );
        const fallback = [
            flatEventOf({ kind: 'price', startSec: 300, quote: 'про цену' }),
        ];

        expect(
            eventWindowCandidates(sparse, fallback, ['price'], 0, NO_PARTS)[0]
                .range,
        ).toEqual({ from: 0, to: 2 });
    });

    it('запись без меток: по времени ничего нет, окно по цитате', () => {
        const plain = prepareTranscript(
            ['Алло.', 'Нужен учёт заявок.', 'Хорошо.'].join('\n'),
        );
        const withTime = [
            flatEventOf({ kind: 'need', startSec: 60, quote: 'учёт заявок' }),
        ];

        expect(
            eventWindowCandidates(plain, withTime, ['need'], 0, NO_PARTS)[0]
                .range,
        ).toEqual({ from: 0, to: 2 });
    });

    it('цитата ищется сначала в строках части события', () => {
        const repeated = prepareTranscript(
            [
                timedLine(0, 'а'),
                timedLine(10, 'повтор'),
                timedLine(20, 'б'),
                timedLine(30, 'повтор'),
            ].join('\n'),
        );
        const event = [
            flatEventOf({
                kind: 'need',
                startSec: null,
                quote: 'клиент: повтор',
                partNumber: 2,
            }),
        ];
        const partTwo = new Map([[2, { from: 2, to: 3 }]]);

        expect(
            eventWindowCandidates(repeated, event, ['need'], 2, partTwo)[0]
                .range,
        ).toEqual({ from: 2, to: 3 });
        expect(
            eventWindowCandidates(repeated, event, ['need'], 2, NO_PARTS)[0]
                .range,
        ).toEqual({ from: 0, to: 2 });
    });
});
