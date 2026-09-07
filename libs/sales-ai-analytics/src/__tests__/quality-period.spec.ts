import {
    QUALITY_CONTENT_SECTIONS,
    QUALITY_FORM_SECTIONS,
    QUALITY_SECTION_KIND,
    contentScore,
    formScore,
    isFormSection,
    sectionKind,
} from '../model/form-content.const';
import {
    QualityCall,
    aggregateQualityByBucket,
    aggregateQualityBySection,
    buildQualityPeriod,
    compareSectionCodes,
    isSectionCode,
    qualityScoreOfCall,
} from '../model/quality-period';
import { liteRows, section } from './lite-row.fixture';

/** Звонок для агрегата качества: тип, weightedScore 0–100 и разделы. */
const call = (patch: Partial<QualityCall> = {}): QualityCall => ({
    callType: 'presentation',
    score: 70,
    sections: [],
    ...patch,
});

const calls = (
    count: number,
    patch: Partial<QualityCall> = {},
): QualityCall[] => Array.from({ length: count }, () => call(patch));

describe('qualityScoreOfCall', () => {
    it('S = weightedScore/10 (план §4.3)', () => {
        expect(qualityScoreOfCall(70)).toBe(7);
        expect(qualityScoreOfCall(0)).toBe(0);
        expect(qualityScoreOfCall(100)).toBe(10);
    });
});

describe('aggregateQualityByBucket', () => {
    it('корзины плана: контакт = cold + call + site_lead, закрытие = refine + decision + payment', () => {
        const result = aggregateQualityByBucket([
            ...calls(3, { callType: 'cold', score: 60 }),
            ...calls(2, { callType: 'call', score: 80 }),
            ...calls(1, { callType: 'site_lead', score: 100 }),
            ...calls(4, { callType: 'presentation', score: 70 }),
            ...calls(2, { callType: 'refine', score: 50 }),
            ...calls(3, { callType: 'decision', score: 60 }),
            ...calls(3, { callType: 'payment', score: 70 }),
        ]);
        const byBucket = new Map(result.map(item => [item.bucket, item]));
        expect(byBucket.get('contact')?.n).toBe(6);
        expect(byBucket.get('presentation')?.n).toBe(4);
        expect(byBucket.get('closing')?.n).toBe(8);
    });

    it('other, irrelevant и звонки без разбора в корзины не попадают', () => {
        const result = aggregateQualityByBucket([
            ...calls(9, { callType: 'cold', score: 60 }),
            ...calls(5, { callType: 'other', score: 90 }),
            ...calls(4, { callType: 'irrelevant', score: 10 }),
            ...calls(3, { callType: 'cold', score: null }),
        ]);
        const contact = result.find(item => item.bucket === 'contact');
        expect(contact?.n).toBe(9);
        expect(contact?.score.value).toBeCloseTo(6, 6);
    });

    it('n < 8 → confidence none и значение не показывается', () => {
        const [contact] = aggregateQualityByBucket(
            calls(7, { callType: 'cold', score: 60 }),
        );
        expect(contact.n).toBe(7);
        expect(contact.score.value).toBeNull();
        expect(contact.score.confidence.level).toBe('none');
    });
});

describe('aggregateQualityBySection', () => {
    it('у раздела собственное n_j: только relevance > 0 и оценка', () => {
        const result = aggregateQualityBySection([
            ...calls(10, {
                sections: [section('NEEDS', 6, 90), section('PRICE', 4, 50)],
            }),
            ...calls(5, {
                sections: [section('NEEDS', 8, 70), section('PRICE', null, 50)],
            }),
        ]);
        const needs = result.find(item => item.section === 'NEEDS');
        const price = result.find(item => item.section === 'PRICE');
        expect(needs?.n).toBe(15);
        expect(needs?.score.value).toBeCloseTo((10 * 6 + 5 * 8) / 15, 6);
        expect(needs?.score.confidence.level).toBe('low');
        expect(needs?.avgRelevance).toBeCloseTo((10 * 90 + 5 * 70) / 15, 6);
        expect(price?.n).toBe(10);
    });

    it('раздел с relevance = 0 в агрегат не попадает', () => {
        const result = aggregateQualityBySection(
            calls(12, {
                sections: [section('CLOSING', 7, 90), section('REFUSAL', 9, 0)],
            }),
        );
        expect(result.map(item => item.section)).toEqual(['CLOSING']);
    });

    it('n ≥ 20 → confidence ok, порядок разделов — по рубрике', () => {
        const result = aggregateQualityBySection(
            calls(20, {
                sections: [
                    section('CLOSING', 7),
                    section('GREETING', 5),
                    section('NEEDS', 6),
                ],
            }),
        );
        expect(result.map(item => item.section)).toEqual([
            'GREETING',
            'NEEDS',
            'CLOSING',
        ]);
        expect(result[0].score.confidence.level).toBe('ok');
    });

    it('неизвестный код раздела — после кодов рубрики', () => {
        expect(compareSectionCodes('GREETING', 'NEEDS')).toBeLessThan(0);
        expect(compareSectionCodes('ZZZ', 'REFUSAL')).toBeGreaterThan(0);
        expect(isSectionCode('NEEDS')).toBe(true);
        expect(isSectionCode('ZZZ')).toBe(false);
        expect(isSectionCode(null)).toBe(false);
    });
});

describe('buildQualityPeriod', () => {
    it('общее среднее — по звонкам с корзиной, остальные считаются отдельно', () => {
        const period = buildQualityPeriod([
            ...calls(10, { callType: 'presentation', score: 70 }),
            ...calls(10, { callType: 'cold', score: 50 }),
            ...calls(4, { callType: 'other', score: 100 }),
            ...calls(2, { callType: 'presentation', score: null }),
        ]);
        expect(period.n).toBe(20);
        expect(period.nNoBucket).toBe(4);
        expect(period.score.value).toBeCloseTo(6, 6);
        expect(period.score.confidence.level).toBe('ok');
        expect(period.buckets).toHaveLength(3);
    });

    it('пустой период: корзины отдаются все три, значений нет', () => {
        const period = buildQualityPeriod([]);
        expect(period.n).toBe(0);
        expect(period.score.value).toBeNull();
        expect(period.buckets.map(item => item.n)).toEqual([0, 0, 0]);
        expect(period.sections).toEqual([]);
    });

    it('принимает lite-строки звонков call-lib без адаптера', () => {
        const period = buildQualityPeriod(
            liteRows('t', 9, {
                callType: 'presentation',
                score: 80,
                sections: [section('NEEDS', 7)],
            }),
        );
        expect(period.n).toBe(9);
        expect(period.score.value).toBeCloseTo(8, 6);
        expect(period.sections[0]).toMatchObject({ section: 'NEEDS', n: 9 });
    });
});

describe('formScore (форма vs содержание, §4.3)', () => {
    it('форма — GREETING, NEEDS, CLOSING; содержание — OBJECTIONS, PRICE, REFUSAL', () => {
        expect([...QUALITY_FORM_SECTIONS]).toEqual([
            'GREETING',
            'NEEDS',
            'CLOSING',
        ]);
        expect([...QUALITY_CONTENT_SECTIONS]).toEqual([
            'OBJECTIONS',
            'PRICE',
            'REFUSAL',
        ]);
        expect(QUALITY_SECTION_KIND.PRESENTATION).toBe('mixed');
        expect(isFormSection('NEEDS')).toBe(true);
        expect(isFormSection('PRICE')).toBe(false);
        expect(sectionKind('ZZZ')).toBe('mixed');
    });

    it('игнорирует OBJECTIONS / PRICE / REFUSAL и PRESENTATION', () => {
        const sections = [
            section('GREETING', 6, 100),
            section('NEEDS', 8, 50),
            section('OBJECTIONS', 1, 100),
            section('PRICE', 1, 100),
            section('REFUSAL', 1, 100),
            section('PRESENTATION', 10, 100),
        ];
        // (6·100 + 8·50)/150 = 6,667 — содержание и презентация не влияют.
        expect(formScore(sections)).toBeCloseTo((6 * 100 + 8 * 50) / 150, 6);
        expect(contentScore(sections)).toBeCloseTo(1, 6);
    });

    it('раздел формы без relevance или без оценки в S^form не входит', () => {
        expect(
            formScore([section('GREETING', 7, 0), section('NEEDS', 5, 80)]),
        ).toBeCloseTo(5, 6);
        expect(
            formScore([section('GREETING', null, 90), section('NEEDS', 4, 60)]),
        ).toBeCloseTo(4, 6);
    });

    it('ни одного раздела формы → null', () => {
        expect(formScore([])).toBeNull();
        expect(formScore([section('PRICE', 9, 100)])).toBeNull();
    });
});
