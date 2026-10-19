import type { AgreementRun } from '../agreement-report';
import {
    buildVersionAgreementReport,
    isVersionAgreementReportLike,
    scaleShiftOf,
    type VersionAgreementPair,
} from '../version-agreement-report';

/**
 * Согласие старой и новой версии промпта: общий отчёт по всем парам и
 * разбивка по старой версии — пары, ICC/σ, средний сдвиг «новая − старая»
 * общего балла и оценок разделов.
 */
const run = (score: number, needs: number): AgreementRun => ({
    categories: { callType: 'presentation' },
    scales: { score, section_NEEDS: needs },
    objections: [],
});

const pair = (
    key: string,
    first: AgreementRun,
    second: AgreementRun,
    firstPromptVersion: string | null,
): VersionAgreementPair => ({ key, first, second, firstPromptVersion });

describe('buildVersionAgreementReport', () => {
    const report = buildVersionAgreementReport({
        fromSeries: '2026-09-08',
        toPromptVersion: 'focus-v2.4-2026-10-20',
        pairs: [
            pair('t-1', run(7, 5), run(6, 5), 'focus-v2.2-2026-09-08'),
            pair('t-2', run(8, 6), run(8, 6), 'focus-v2.2-2026-09-08'),
            pair('t-3', run(5, 4), run(6, 4), null),
        ],
        sigmaScale: 'score',
        sectionScalePrefix: 'section_',
    });

    it('ключ — старая серия → текущая версия; общий отчёт по всем парам', () => {
        expect(report.key).toBe('2026-09-08->focus-v2.4-2026-10-20');
        expect(report.fromSeries).toBe('2026-09-08');
        expect(report.pairs).toBe(3);
        expect(report.overall.pairs).toBe(3);
        expect(report.overall.promptVersion).toBe(report.key);
        expect(report.overall.sigmaLlm.scale).toBe('score');
    });

    it('разбивка по старой версии промпта: число пар, ICC/σ, сдвиг балла и разделов; без версий — группа none', () => {
        expect(
            report.byOldPromptVersion.map(item => item.promptVersion),
        ).toEqual(['focus-v2.2-2026-09-08', 'none']);
        const v22 = report.byOldPromptVersion[0];
        expect(v22.pairs).toBe(2);
        // (6 − 7) и (8 − 8) → средний сдвиг −0.5.
        expect(v22.meanShift).toBeCloseTo(-0.5);
        expect(v22.icc).not.toBeNull();
        expect(v22.sigma).not.toBeNull();
        expect(v22.sectionShifts).toEqual([
            { code: 'section_NEEDS', n: 2, meanShift: 0 },
        ]);
        const none = report.byOldPromptVersion[1];
        expect(none.pairs).toBe(1);
        expect(none.meanShift).toBe(1);
        // Одна пара — ICC и σ не считаются.
        expect(none.icc).toBeNull();
        expect(none.sigma).toBeNull();
    });

    it('пустые пары — отчёт без разрезов; серия null → none', () => {
        const empty = buildVersionAgreementReport({
            fromSeries: null,
            toPromptVersion: 'v',
            pairs: [],
            sigmaScale: 'score',
            sectionScalePrefix: 'section_',
        });
        expect(empty.key).toBe('none->v');
        expect(empty.pairs).toBe(0);
        expect(empty.byOldPromptVersion).toEqual([]);
    });

    it('scaleShiftOf считает «второй − первый» только по парам с обеими оценками', () => {
        const shift = scaleShiftOf(
            [
                pair('a', run(5, 4), run(7, 4), null),
                pair(
                    'b',
                    { categories: {}, scales: { score: null }, objections: [] },
                    run(7, 4),
                    null,
                ),
            ],
            'score',
        );
        expect(shift).toEqual({ code: 'score', n: 1, meanShift: 2 });
    });

    it('структурная проверка нагрузки', () => {
        expect(isVersionAgreementReportLike(report)).toBe(true);
        expect(isVersionAgreementReportLike({ key: 'x' })).toBe(false);
        expect(isVersionAgreementReportLike(null)).toBe(false);
    });
});
