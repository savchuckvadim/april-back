import {
    isFinalVariantStage,
    selectVariantsToCopy,
} from '../lib/select-variants-to-copy';

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

    it('«Текущий» больше никого не выкидывает: это признак открытого варианта, а не выбора', () => {
        // конструктор ставит «Текущий» автоматически тому набору, который
        // открыт на экране — если бы правило осталось, робот увозил бы один
        const draft = stage('DRAFT');
        const current = stage('CURRENT');
        const merged = stage('MERGED');

        expect(selectVariantsToCopy([draft, current, merged])).toEqual([
            draft,
            current,
            merged,
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

    it('закрытые прошлым периодом наборы не едут по второму кругу', () => {
        const draft = stage('DRAFT');

        expect(
            selectVariantsToCopy([
                draft,
                // уже уехал в поставку когда-то
                stage('SUCCESS'),
                // не выбрали в прошлый раз
                stage('FAILED'),
            ]),
        ).toEqual([draft]);
    });

    it('стадии продажи не финальные — набор в работе и едет', () => {
        expect(isFinalVariantStage('DT1046_1:OFFER')).toBe(false);
        expect(isFinalVariantStage('DT1046_1:APPROVAL')).toBe(false);
        expect(isFinalVariantStage('DT1046_1:SUCCESS')).toBe(true);
        expect(isFinalVariantStage('DT1046_1:REJECTED')).toBe(true);
        expect(isFinalVariantStage('DT1046_1:FAILED')).toBe(true);
        // чужая и пустая стадия финалом не считаются
        expect(isFinalVariantStage('DT999_1:SOMETHING')).toBe(false);
        expect(isFinalVariantStage(null)).toBe(false);
    });
});
