import { buildOwnerReportFacts } from '../owner-report';
import { mergeOwnerReportFacts } from '../owner-report.merge';
import type { OwnerReportPeriod } from '../owner-report.types';
import { OCTOBER, call, resetCounter } from './owner-report.fixture';

const SEPTEMBER: OwnerReportPeriod = {
    ...OCTOBER,
    from: '2026-09-01',
    to: '2026-09-30',
};
const QUARTER: OwnerReportPeriod = {
    ...OCTOBER,
    kind: 'quarter',
    from: '2026-07-01',
    to: '2026-09-30',
};

/** Строки двух месяцев: сентябрь и октябрь; в октябре другой сотрудник и показы. */
const september = () => [
    call({ day: '2026-09-07' }),
    call({ day: '2026-09-08', outcome: 'postponed' }),
    call({ day: '2026-09-29', callType: 'presentation', topics: ['price'] }),
    call({ day: '2026-09-30', callType: 'decision', outcome: 'refused' }),
];
const october = () => [
    call({ day: '2026-10-01', managerId: '8' }),
    call({ day: '2026-10-05', callType: 'presentation', outcome: 'postponed' }),
    call({ day: '2026-10-06', callType: 'presentation', managerId: '8' }),
];

describe('mergeOwnerReportFacts — сводные факты из месячных', () => {
    beforeEach(resetCounter);

    it('счётчики складываются, доли пересчитываются по сумме — как при прямом расчёте по всем строкам', () => {
        const sep = buildOwnerReportFacts(september(), SEPTEMBER);
        const oct = buildOwnerReportFacts(october(), OCTOBER);
        const merged = mergeOwnerReportFacts([sep, oct], {
            ...OCTOBER,
            from: '2026-09-01',
            to: '2026-10-31',
        });
        resetCounter();
        const direct = buildOwnerReportFacts([...september(), ...october()], {
            ...OCTOBER,
            from: '2026-09-01',
            to: '2026-10-31',
        });

        expect(merged.composedOf).toEqual(['2026-09', '2026-10']);
        expect(merged.coverage.analyzed).toBe(7);
        expect(merged.coverage.calls).toBe(direct.coverage.calls);
        expect(merged.outcomes).toEqual(direct.outcomes);
        expect(merged.byTypeGroup).toEqual(direct.byTypeGroup);
        expect(merged.funnel).toEqual(direct.funnel);
        expect(merged.presentations.calls).toBe(direct.presentations.calls);
        expect(merged.presentations.advanced).toEqual(
            direct.presentations.advanced,
        );
        expect(merged.reactivation).toEqual(direct.reactivation);
        expect(merged.objections.byTopic).toEqual(direct.objections.byTopic);
        expect(merged.unattributedCalls).toBe(direct.unattributedCalls);
        // Сотрудники: суммы по каждому и доля в команде по общему числу разговоров.
        expect(merged.managers.map(row => [row.managerId, row.calls])).toEqual(
            direct.managers.map(row => [row.managerId, row.calls]),
        );
        expect(merged.managers[0].shareOfTeam).toEqual(
            direct.managers[0].shareOfTeam,
        );
        expect(merged.managers[0].contactedAdvanced).toEqual(
            direct.managers[0].contactedAdvanced,
        );
    });

    it('неделя на стыке месяцев склеивается из двух частичных в полную', () => {
        const sep = buildOwnerReportFacts(september(), SEPTEMBER);
        const oct = buildOwnerReportFacts(october(), OCTOBER);
        const merged = mergeOwnerReportFacts([sep, oct], {
            ...OCTOBER,
            from: '2026-09-01',
            to: '2026-10-31',
        });
        // Понедельник 28.09 — неделя 28.09–04.10: в сентябре и октябре по части.
        const joint = merged.weeks.find(week => week.weekKey === '2026-09-28');
        expect(joint).toMatchObject({
            from: '2026-09-28',
            to: '2026-10-04',
            partial: false,
            calls: 3,
        });
        expect(merged.weeks.map(week => week.weekKey)).toEqual(
            [...new Set(merged.weeks.map(week => week.weekKey))].sort(),
        );
    });

    it('признаки управления: значение с весом по n, вердикт по порогам месяца; связь качества — из последнего месяца', () => {
        const sep = buildOwnerReportFacts(september(), SEPTEMBER);
        const oct = buildOwnerReportFacts(october(), OCTOBER);
        const merged = mergeOwnerReportFacts([sep, oct], QUARTER);
        const needs = merged.management.signs.find(
            sign => sign.code === 'needs_discovery',
        );
        expect(needs?.n).toBe(
            (sep.management.signs.find(sign => sign.code === 'needs_discovery')
                ?.n ?? 0) +
                (oct.management.signs.find(
                    sign => sign.code === 'needs_discovery',
                )?.n ?? 0),
        );
        expect(needs?.verdict).toBe('yes');
        expect(['managed', 'partial', 'not_managed']).toContain(
            merged.management.verdict,
        );
        expect(merged.qualityLink).toBeNull();
        expect(merged.period).toEqual(QUARTER);
    });

    it('пустой список месяцев — ошибка', () => {
        expect(() => mergeOwnerReportFacts([], QUARTER)).toThrow(
            'Нечего объединять',
        );
    });
});
