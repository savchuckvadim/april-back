import { selectVariantsToCopy } from '../lib/select-variants-to-copy';

/**
 * Отбор вариантов, которые переезжают со сделкой в отдел сервиса. Стадия
 * элемента — единственный след выбора менеджера, поэтому правило читается
 * именно по ней.
 */
describe('selectVariantsToCopy', () => {
    const stage = (suffix: string) => ({ stageId: `DT1046_1:${suffix}` });

    it('стадий никто не трогал — едут все варианты', () => {
        const candidates = [stage('DRAFT'), stage('DRAFT'), { stageId: null }];

        expect(selectVariantsToCopy(candidates)).toHaveLength(3);
    });

    it('отклонённые не едут никогда', () => {
        const draft = stage('DRAFT');
        const candidates = [draft, stage('REJECTED')];

        expect(selectVariantsToCopy(candidates)).toEqual([draft]);
    });

    it('есть текущие — едут только они, черновики остаются', () => {
        const current = stage('CURRENT');
        const candidates = [stage('DRAFT'), current, stage('MERGED')];

        expect(selectVariantsToCopy(candidates)).toEqual([current]);
    });

    it('текущих несколько — едут все текущие', () => {
        const first = stage('CURRENT');
        const second = stage('CURRENT');

        expect(selectVariantsToCopy([first, stage('DRAFT'), second])).toEqual([
            first,
            second,
        ]);
    });

    it('текущий отклонён — он не едет, даже будучи текущим', () => {
        const draft = stage('DRAFT');

        expect(selectVariantsToCopy([draft, stage('REJECTED')])).toEqual([
            draft,
        ]);
    });

    it('чужая стадия считается черновиком, а не поводом всё выбросить', () => {
        const alien = { stageId: 'DT999_1:SOMETHING' };

        expect(selectVariantsToCopy([alien])).toEqual([alien]);
    });

    it('все отклонены — не едет никто', () => {
        expect(selectVariantsToCopy([stage('REJECTED')])).toEqual([]);
    });
});
