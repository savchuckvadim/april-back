import {
    DIGEST_COMPARE_SCOPE,
    DIGEST_DIRECTION,
    DIGEST_POSITION,
} from '../period-digest.codes';
import {
    DigestPeer,
    digestMedian,
    digestPositionOf,
    digestStandingsOf,
    withSectionStandings,
} from '../period-digest.department';

const peer = (
    managerId: string,
    departmentId: number | null,
    value: number | null,
    n = 10,
): DigestPeer => ({ managerId, departmentId, value: { value, n } });

const OPTIONS = { minN: 5, threshold: 0.5 };

describe('сравнение с отделом словами', () => {
    it('медиана — середина отдела', () => {
        expect(digestMedian([5, 1, 3])).toBe(3);
        expect(digestMedian([4, 1, 3, 2])).toBe(2.5);
    });

    it('выше / около / ниже середины — с порогом, граница засчитывается', () => {
        expect(digestPositionOf(5.5, 5, 0.5)).toBe(DIGEST_POSITION.above);
        expect(digestPositionOf(5.4, 5, 0.5)).toBe(DIGEST_POSITION.middle);
        expect(digestPositionOf(4.5, 5, 0.5)).toBe(DIGEST_POSITION.below);
        // Погрешность дробей: 0,3 − 0,2 считается сдвигом на 0,1.
        expect(digestPositionOf(0.3, 0.2, 0.1)).toBe(DIGEST_POSITION.above);
    });

    it('у метрики «меньше — лучше» положение переворачивается', () => {
        expect(digestPositionOf(0.6, 0.3, 0.1, DIGEST_DIRECTION.down)).toBe(
            DIGEST_POSITION.below,
        );
        expect(digestPositionOf(0.1, 0.3, 0.1, DIGEST_DIRECTION.down)).toBe(
            DIGEST_POSITION.above,
        );
    });

    it('в отделе трое с данными — сравнение внутри отдела', () => {
        const standings = digestStandingsOf(
            [
                peer('1', 7, 4),
                peer('2', 7, 6),
                peer('3', 7, 6.2),
                peer('4', 8, 9),
            ],
            OPTIONS,
        );

        expect(standings.get('1')).toEqual({
            position: DIGEST_POSITION.below,
            scope: DIGEST_COMPARE_SCOPE.department,
        });
        expect(standings.get('2')).toEqual({
            position: DIGEST_POSITION.middle,
            scope: DIGEST_COMPARE_SCOPE.department,
        });
    });

    it('в отделе меньше трёх — сравнение по всей структуре', () => {
        const standings = digestStandingsOf(
            [
                peer('1', 7, 4),
                peer('2', 7, 6),
                peer('3', 7, 7),
                peer('4', 8, 9),
                peer('5', null, 3),
            ],
            OPTIONS,
        );

        // Середина структуры — медиана 3, 4, 6, 7, 9 = 6.
        expect(standings.get('4')).toEqual({
            position: DIGEST_POSITION.above,
            scope: DIGEST_COMPARE_SCOPE.structure,
        });
        expect(standings.get('5')).toEqual({
            position: DIGEST_POSITION.below,
            scope: DIGEST_COMPARE_SCOPE.structure,
        });
    });

    it('менее трёх с данными во всей структуре — сравнения нет', () => {
        const standings = digestStandingsOf(
            [peer('1', 7, 4), peer('2', 7, 6), peer('3', 7, 7, 2)],
            OPTIONS,
        );

        expect(standings.get('1')).toBeNull();
        expect(standings.get('2')).toBeNull();
    });

    it('у менеджера данных меньше минимума — сравнивать нечего', () => {
        const standings = digestStandingsOf(
            [
                peer('1', 7, 4),
                peer('2', 7, 6),
                peer('3', 7, 7),
                peer('4', 7, 2, 4),
                peer('5', 7, null, 0),
            ],
            OPTIONS,
        );

        expect(standings.get('4')).toBeNull();
        expect(standings.get('5')).toBeNull();
        // Без них середина отдела — 6: у '1' ниже.
        expect(standings.get('1')?.position).toBe(DIGEST_POSITION.below);
    });

    it('разделы: середина считается по каждому разделу отдельно', () => {
        const section = (code: string, mean: number, n = 6) => ({
            section: code,
            mean,
            n,
            standing: null,
        });
        const result = withSectionStandings(
            [
                {
                    managerId: '1',
                    departmentId: 7,
                    sections: [section('NEEDS', 3), section('CLOSING', 8)],
                },
                {
                    managerId: '2',
                    departmentId: 7,
                    sections: [section('NEEDS', 6), section('CLOSING', 8)],
                },
                {
                    managerId: '3',
                    departmentId: 7,
                    sections: [section('NEEDS', 7)],
                },
            ],
            { minN: 5 },
        );

        expect(result.get('1')).toEqual([
            {
                ...section('NEEDS', 3),
                standing: {
                    position: DIGEST_POSITION.below,
                    scope: DIGEST_COMPARE_SCOPE.department,
                },
            },
            // CLOSING оценён у двоих — сравнения нет.
            section('CLOSING', 8),
        ]);
        expect(result.get('3')?.[0].standing).toEqual({
            position: DIGEST_POSITION.above,
            scope: DIGEST_COMPARE_SCOPE.department,
        });
    });
});
