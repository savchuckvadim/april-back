import { resolveCreateStageForSlot } from './act-slot-sync.util';

describe('resolveCreateStageForSlot', () => {
    describe('договор в процессе (01.01–31.12, идёт июнь): passed=5, total=12', () => {
        const passedMonths = 5;
        const totalMonths = 12;

        it('прошедшие месяцы (1..5) → success', () => {
            for (let m = 1; m <= passedMonths; m++) {
                expect(resolveCreateStageForSlot(m, passedMonths)).toBe(
                    'success',
                );
            }
        });

        it('текущий месяц (6) → inwork (Выписан)', () => {
            expect(resolveCreateStageForSlot(6, passedMonths)).toBe('inwork');
        });

        it('будущие месяцы (7..12) → planned (Запланирован)', () => {
            for (let m = passedMonths + 2; m <= totalMonths; m++) {
                expect(resolveCreateStageForSlot(m, passedMonths)).toBe(
                    'planned',
                );
            }
        });
    });

    it('договор только начался (passed=0): месяц 1 → inwork, остальные → planned', () => {
        expect(resolveCreateStageForSlot(1, 0)).toBe('inwork');
        expect(resolveCreateStageForSlot(2, 0)).toBe('planned');
        expect(resolveCreateStageForSlot(12, 0)).toBe('planned');
    });

    it('договор истёк (passed === total): все месяцы → success, ни одного inwork', () => {
        const total = 12;
        for (let m = 1; m <= total; m++) {
            expect(resolveCreateStageForSlot(m, total)).toBe('success');
        }
    });
});
