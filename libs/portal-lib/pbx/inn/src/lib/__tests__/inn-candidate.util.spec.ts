import {
    describeInnSource,
    mergeInnObservations,
    pickAutoInn,
} from '../inn-candidate.util';
import {
    IInnObservation,
    INN_SOURCE_KINDS,
    INN_STRENGTHS,
} from '../../type/inn.type';

/** ИНН ниже — валидные по контрольной сумме, иначе тест ничего не значит. */
const REQUISITE_INN = '7707083893';
const TITLE_INN = '7812032055';

const observation = (
    inn: string,
    kind: IInnObservation['kind'],
    extra: Partial<IInnObservation> = {},
): IInnObservation => ({ inn, kind, ...extra });

describe('mergeInnObservations', () => {
    it('одно значение из разных мест — один кандидат с двумя источниками', () => {
        const candidates = mergeInnObservations(
            [
                observation(REQUISITE_INN, INN_SOURCE_KINDS.company_requisite, {
                    entityId: 812,
                    entityTitle: 'Ромашка',
                }),
                observation(REQUISITE_INN, INN_SOURCE_KINDS.lead_field, {
                    entityId: 124063,
                }),
            ],
            { pool: [], current: '', hidden: [] },
        );

        expect(candidates).toHaveLength(1);
        expect(candidates[0].sources.map(source => source.kind)).toEqual([
            INN_SOURCE_KINDS.company_requisite,
            INN_SOURCE_KINDS.lead_field,
        ]);
        // Подпись — от самого надёжного источника.
        expect(candidates[0].label).toBe('из реквизита компании «Ромашка»');
        expect(candidates[0].strength).toBe(INN_STRENGTHS.strong);
    });

    it('найденное только в названии — слабое', () => {
        const [candidate] = mergeInnObservations(
            [observation(TITLE_INN, INN_SOURCE_KINDS.title, { entityId: 1 })],
            { pool: [], current: '', hidden: [] },
        );

        expect(candidate.strength).toBe(INN_STRENGTHS.weak);
        expect(candidate.label).toBe('из названия — проверьте');
    });

    it('текущий идёт первым, скрытые — последними', () => {
        const candidates = mergeInnObservations(
            [
                observation(TITLE_INN, INN_SOURCE_KINDS.company_requisite),
                observation(REQUISITE_INN, INN_SOURCE_KINDS.deal_field),
                observation('500100732259', INN_SOURCE_KINDS.company_field),
            ],
            {
                pool: [REQUISITE_INN],
                current: REQUISITE_INN,
                hidden: [TITLE_INN],
            },
        );

        expect(candidates.map(item => item.inn)).toEqual([
            REQUISITE_INN,
            '500100732259',
            TITLE_INN,
        ]);
        expect(candidates[0].isCurrent).toBe(true);
        expect(candidates[0].inPool).toBe(true);
        expect(candidates[2].hidden).toBe(true);
    });

    it('разрядность попадает в кандидата: 10 — юрлицо, 12 — ИП', () => {
        const candidates = mergeInnObservations(
            [
                observation(REQUISITE_INN, INN_SOURCE_KINDS.deal_pool),
                observation('500100732259', INN_SOURCE_KINDS.deal_pool),
            ],
            { pool: [], current: '', hidden: [] },
        );

        expect(candidates.map(item => item.digits)).toEqual([10, 12]);
    });
});

describe('pickAutoInn', () => {
    const merge = (observations: IInnObservation[], hidden: string[] = []) =>
        mergeInnObservations(observations, { pool: [], current: '', hidden });

    it('один надёжный кандидат — автоматика ставит его сама', () => {
        const candidates = merge([
            observation(REQUISITE_INN, INN_SOURCE_KINDS.company_requisite),
        ]);

        expect(pickAutoInn(candidates)).toBe(REQUISITE_INN);
    });

    /*
     * Ночной догон 17.09 ставил «первый валидный из многих» — так и
     * появились четыре тысячи догадок, которые не отличить от выбора
     * человека. Кандидатов больше одного — решает человек.
     */
    it('кандидатов больше одного — автоматика не выбирает', () => {
        const candidates = merge([
            observation(REQUISITE_INN, INN_SOURCE_KINDS.company_requisite),
            observation(TITLE_INN, INN_SOURCE_KINDS.lead_field),
        ]);

        expect(pickAutoInn(candidates)).toBeNull();
    });

    it('единственный кандидат из названия — слишком слабо для автоматики', () => {
        const candidates = merge([
            observation(TITLE_INN, INN_SOURCE_KINDS.title),
        ]);

        expect(pickAutoInn(candidates)).toBeNull();
    });

    it('скрытый вариант в автоподстановке не участвует', () => {
        const candidates = merge(
            [observation(REQUISITE_INN, INN_SOURCE_KINDS.company_requisite)],
            [REQUISITE_INN],
        );

        expect(pickAutoInn(candidates)).toBeNull();
    });
});

describe('describeInnSource', () => {
    it('подпись ручного добавления — с автором и датой', () => {
        const label = describeInnSource(
            observation(REQUISITE_INN, INN_SOURCE_KINDS.manual, {
                userName: 'Иванов Иван',
                at: '2026-09-12T10:00:00+03:00',
            }),
        );

        expect(label).toBe('добавил Иванов Иван 12.09.2026');
    });

    it('подпись заявки — с номером лида', () => {
        expect(
            describeInnSource(
                observation(REQUISITE_INN, INN_SOURCE_KINDS.lead_field, {
                    entityId: 124063,
                }),
            ),
        ).toBe('из заявки (лид №124063)');
    });
});
