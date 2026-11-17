import { assembleQualityFacts } from '../../quality-facts.assembler';
import { digestPeerViewsOf, DigestMember } from '../period-digest.standings';
import {
    THRESHOLDS,
    digestCalls,
    digestContextOf,
    sectionAsWas,
} from './digest-context.fixture';

/** Менеджер: пять презентаций с одной оценкой «Выявления потребностей». */
function member(
    managerId: string,
    departmentId: number | null,
    needs: number,
    score: number,
): DigestMember {
    const rows = digestCalls(`m${managerId}-`, 'presentation', 5, () => ({
        score,
        sections: [sectionAsWas('NEEDS', needs)],
    }));
    return {
        managerId,
        departmentId,
        metrics: digestContextOf(rows).metrics,
        quality: assembleQualityFacts(rows, THRESHOLDS),
    };
}

const MEMBERS = [
    member('1', 7, 3, 50),
    member('2', 7, 6, 70),
    member('3', 7, 7, 80),
    member('4', 8, 8, 90),
];

describe('сравнение менеджеров выпуска с отделом', () => {
    const views = digestPeerViewsOf(MEMBERS, { minN: 5 });

    it('средняя оценка и шаг с датой — словами, со своим отделом или структурой', () => {
        expect(views.get('1')?.standings).toEqual({
            score: { position: 'below', scope: 'department', middle: 7 },
            nextStepDated: {
                position: 'middle',
                scope: 'department',
                middle: 1,
            },
        });
        // В отделе 8 один менеджер — сравнение по всей структуре.
        expect(views.get('4')?.standings.score).toEqual({
            position: 'above',
            scope: 'structure',
            middle: 7.5,
        });
    });

    it('разделы получают положение в отделе', () => {
        expect(views.get('1')?.sections).toEqual([
            {
                section: 'NEEDS',
                mean: 3,
                n: 5,
                standing: { position: 'below', scope: 'department', middle: 6 },
            },
        ]);
    });

    it('ориентиры разделов для «Внимания» — по отделу, а в маленьком отделе — по структуре', () => {
        const [department] = views.get('1')?.benchmarks ?? [];
        expect(department.section).toBe('NEEDS');
        expect(department.mean).toBeCloseTo(16 / 3);
        expect(department.n).toBe(15);

        expect(views.get('4')?.benchmarks).toEqual([
            { section: 'NEEDS', mean: 6, n: 20 },
        ]);
    });
});
