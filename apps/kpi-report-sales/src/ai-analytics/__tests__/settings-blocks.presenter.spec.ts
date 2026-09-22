import type { AiAbsencesByManager, AiTargets } from '@lib/sales-ai-analytics';
import {
    toAbsencesDto,
    toRosterConfirmedAt,
    toTargetsDto,
} from '../domain/presenter/settings-blocks.presenter';

const targets: AiTargets = {
    byLevel: {
        junior: { sales: null, presentationsMin: 20, coldPerDay: 40 },
        middle: { sales: 6, presentationsMin: 0, coldPerDay: 40 },
        senior: { sales: 9, presentationsMin: 0, coldPerDay: 40 },
    },
    overrides: { '447': 7, '512': null, abc: 3, '0': 1 },
};

describe('settings-blocks.presenter', () => {
    it('цели: уровни в порядке реестра, личные цели с числовым managerId, снятая — null', () => {
        expect(toTargetsDto(targets)).toEqual({
            byLevel: [
                {
                    level: 'junior',
                    sales: null,
                    presentationsMin: 20,
                    coldPerDay: 40,
                },
                {
                    level: 'middle',
                    sales: 6,
                    presentationsMin: 0,
                    coldPerDay: 40,
                },
                {
                    level: 'senior',
                    sales: 9,
                    presentationsMin: 0,
                    coldPerDay: 40,
                },
            ],
            overrides: [
                { managerId: 447, sales: 7 },
                { managerId: 512, sales: null },
            ],
        });
    });

    it('отсутствия: только менеджеры с отрезками и числовым id, поля отрезка без лишнего', () => {
        const absences: AiAbsencesByManager = {
            '447': [{ from: '2026-07-01', to: '2026-07-14', kind: 'vacation' }],
            '512': [],
            bad: [{ from: '2026-07-01', to: '2026-07-02', kind: 'sick' }],
        };

        expect(toAbsencesDto(absences)).toEqual([
            {
                managerId: 447,
                items: [
                    {
                        from: '2026-07-01',
                        to: '2026-07-14',
                        kind: 'vacation',
                    },
                ],
            },
        ]);
    });

    it('дата подтверждения состава: пустая строка → null', () => {
        expect(toRosterConfirmedAt('')).toBeNull();
        expect(toRosterConfirmedAt('2026-09-01')).toBe('2026-09-01');
    });
});
