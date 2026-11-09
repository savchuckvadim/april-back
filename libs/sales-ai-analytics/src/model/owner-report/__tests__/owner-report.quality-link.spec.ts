import type { QualityLinkSnapshot } from '../../../contracts/snapshot.phase4.types';
import { buildOwnerReportQualityLink } from '../owner-report.quality-link';

const snapshot = (
    overrides: Partial<QualityLinkSnapshot>,
): QualityLinkSnapshot =>
    ({
        monthKey: '2026-10',
        status: 'estimated',
        reasons: [],
        sample: { n: 48, events: 19, managers: 6 },
        pooled: { value: 0.35, se: 0.2, ci90: [0.02, 0.68] },
        sRef: 6.5,
        pRef: 0.4,
        curve: [],
        gate: { passedNow: false, streak: 0, months: 3, published: false },
        countdown: { presentationsLeft: 70, monthsLeft: 2 },
        ...overrides,
    }) as unknown as QualityLinkSnapshot;

const logistic = (x: number): number => 1 / (1 + Math.exp(-x));
const logit = (p: number): number => Math.log(p / (1 - p));

describe('buildOwnerReportQualityLink — связь качества показа и продаж для отчёта', () => {
    it('нет снапшота → null; есть оценка, гейт не пройден → предварительная с диапазоном на +2 балла', () => {
        expect(buildOwnerReportQualityLink(null)).toBeNull();
        const link = buildOwnerReportQualityLink(snapshot({}));
        expect(link).toMatchObject({
            status: 'preliminary',
            monthKey: '2026-10',
            presentations: 48,
            events: 19,
            managers: 6,
            sRef: 6.5,
            pRef: 0.4,
            presentationsLeft: 70,
            monthsLeft: 2,
        });
        const base = logit(0.4);
        expect(link?.plusStep?.p).toBeCloseTo(logistic(base + 0.35 * 2), 10);
        expect(link?.plusStep?.low).toBeCloseTo(logistic(base + 0.02 * 2), 10);
        expect(link?.plusStep?.high).toBeCloseTo(logistic(base + 0.68 * 2), 10);
    });

    it('гейт пройден → подтверждённая; без коэффициента или опорной точки → оценки нет, счётчик остаётся', () => {
        expect(
            buildOwnerReportQualityLink(snapshot({ status: 'published' }))
                ?.status,
        ).toBe('confirmed');
        const none = buildOwnerReportQualityLink(
            snapshot({ status: 'insufficient', pooled: null, countdown: null }),
        );
        expect(none).toMatchObject({
            status: 'none',
            sRef: null,
            pRef: null,
            plusStep: null,
            presentationsLeft: null,
            monthsLeft: null,
            presentations: 48,
        });
        expect(
            buildOwnerReportQualityLink(snapshot({ pRef: null }))?.status,
        ).toBe('none');
        // Перепутанный интервал коэффициента — диапазон всё равно от меньшего к большему.
        const swapped = buildOwnerReportQualityLink(
            snapshot({ pooled: { value: 0.35, se: 0.2, ci90: [0.68, 0.02] } }),
        );
        expect(swapped?.plusStep?.low).toBeLessThan(
            swapped?.plusStep?.high ?? 0,
        );
    });
});
