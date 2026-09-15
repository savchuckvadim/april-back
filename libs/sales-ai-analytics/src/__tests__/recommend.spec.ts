import {
    EVIDENCE_DEFAULTS,
    adviceAllowed,
    evidenceLevelFor,
    hasImperative,
    phraseFor,
    type EvidenceInput,
} from '../model/evidence';
import { buildQualityLink } from '../model/qav';
import {
    AI_LEVERS,
    LEVER_DEFAULTS,
    buildLevers,
    type BuildLeversInput,
    type ChecklistLeverInput,
    type ObjectionLeverInput,
} from '../model/recommend';

const CURVE = [
    { s: 5, p: 0.36 },
    { s: 7, p: 0.45 },
    { s: 8.5, p: 0.52 },
];

const dataLink = () =>
    buildQualityLink({ betaSource: 'data', sRef: 7, curve: CURVE });

/** Дизайн, дающий уровень E1 (ассоциация с дизайном). */
const E1_EVIDENCE: EvidenceInput = {
    n: 120,
    hasInterval: true,
    design: {
        managerRandomEffect: true,
        portalMonthOffset: true,
        leadKindStratum: true,
    },
    betaGatePassed: true,
    intervalExcludesPracticalZero: true,
    signStableAcrossStrata: true,
    placeboPassed: true,
    versionsComparable: true,
};

/**
 * Пул для уровня E2: порталов не меньше `pool_min_portals_beta` реестра,
 * I² отчитан, калибровка накрывает 1. Число берётся из дефолта, а не
 * литералом: гейт пула — параметр реестра, и спека следует за ним.
 */
const POOL = {
    portals: EVIDENCE_DEFAULTS.minPoolPortals,
    iSquaredReported: true,
    withinPredictiveInterval: true,
    calibrationSlopeCoversOne: true,
};

/** Тот же дизайн плюс пул — уровень E2 (советы «что менять»). */
const E2_EVIDENCE: EvidenceInput = { ...E1_EVIDENCE, pool: POOL };

const CHECKLIST: ChecklistLeverInput = {
    code: 'next-step',
    withItem: { s: 30, n: 50 },
    withoutItem: { s: 20, n: 60 },
    episodes: 40,
    shareDone: 0.5,
    costHours: 1,
};

const OBJECTION: ObjectionLeverInput = {
    category: 'price',
    crm: { handled: { s: 18, n: 30 }, unhandled: { s: 10, n: 40 } },
    episodes: 20,
    downstream: 0.2,
    costHours: 1,
};

const baseInput = (
    extra: Partial<BuildLeversInput> = {},
): BuildLeversInput => ({
    link: buildQualityLink({ betaSource: 'none' }),
    chainLinked: true,
    evidence: E2_EVIDENCE,
    ...extra,
});

describe('buildLevers — режимы betaSource', () => {
    const quality = {
        section: 'PRICE',
        score: 5,
        delta: 1,
        volume: 100,
        downstream: 0.2,
        sectionCalls: 25,
        coachingHours: 2,
    };

    it('в режиме none рычаг качества не выдаётся', () => {
        const levers = buildLevers(baseInput({ quality }));
        expect(levers.some(lever => lever.lever === 'quality')).toBe(false);
    });

    it('в режиме hypothesis β гипотезы в рычаги не попадает', () => {
        const weak = buildLevers(
            baseInput({
                quality,
                link: buildQualityLink({
                    betaSource: 'hypothesis',
                    hypothesisBeta: 0.17,
                }),
                checklist: [CHECKLIST],
            }),
        );
        const strong = buildLevers(
            baseInput({
                quality,
                link: buildQualityLink({
                    betaSource: 'hypothesis',
                    hypothesisBeta: 0.45,
                }),
                checklist: [CHECKLIST],
            }),
        );
        expect(weak.some(lever => lever.lever === 'quality')).toBe(false);
        expect(weak).toEqual(strong);
    });

    it('в режиме data эффект качества берётся со шкалы вероятности', () => {
        const levers = buildLevers(baseInput({ quality, link: dataLink() }));
        const candidate = levers.find(lever => lever.lever === 'quality');
        expect(candidate).toBeDefined();
        expect(candidate?.deltaSales as number).toBeCloseTo(0.884, 2);
        expect(candidate?.cost).toBe(2);
        expect(candidate?.section).toBe('PRICE');
    });

    it('раздел с малым числом разборов рычага не даёт', () => {
        const levers = buildLevers(
            baseInput({
                link: dataLink(),
                quality: {
                    ...quality,
                    sectionCalls: LEVER_DEFAULTS.minSectionCalls - 1,
                },
            }),
        );
        expect(levers).toHaveLength(0);
    });
});

describe('buildLevers — критерий и лимит', () => {
    it('рычаг не выдаётся при LB80(Δ) ≤ 0', () => {
        const levers = buildLevers(
            baseInput({
                checklist: [
                    {
                        ...CHECKLIST,
                        withItem: { s: 26, n: 50 },
                        withoutItem: { s: 28, n: 60 },
                    },
                ],
            }),
        );
        expect(levers).toHaveLength(0);
    });

    it('рычагов не больше трёх, у каждого basis и ruleCode', () => {
        const levers = buildLevers(
            baseInput({
                link: dataLink(),
                volume: {
                    callType: 'presentation',
                    addedUnits: 20,
                    salesPerUnit: 0.05,
                    salesPerUnitCi80: [0.03, 0.07],
                    costMinutes: 45,
                },
                quality: {
                    score: 5,
                    delta: 1,
                    volume: 100,
                    downstream: 0.2,
                    sectionCalls: 25,
                    coachingHours: 2,
                },
                checklist: [CHECKLIST],
                pipeline: {
                    openDeals: 10,
                    hot: { s: 12, n: 30 },
                    stage: { s: 6, n: 60 },
                },
                objections: [OBJECTION],
            }),
        );
        expect(levers).toHaveLength(LEVER_DEFAULTS.max);
        expect(levers.map(lever => lever.lever)).toEqual([
            'checklist',
            'pipeline',
            'objection',
        ]);
        for (const lever of levers) {
            expect(AI_LEVERS).toContain(lever.lever);
            expect(lever.ruleCode.length).toBeGreaterThan(0);
            expect(lever.basis.length).toBeGreaterThan(0);
            expect(lever.ci80?.[0] as number).toBeGreaterThan(0);
        }
    });

    it('без интервала эффекта рычаг объёма не выдаётся', () => {
        const levers = buildLevers(
            baseInput({
                volume: {
                    callType: 'presentation',
                    addedUnits: 20,
                    salesPerUnit: 0.05,
                    costMinutes: 45,
                },
            }),
        );
        expect(levers).toHaveLength(0);
    });
});

describe('buildLevers — возражения и сцепка со сделкой', () => {
    it('исход берётся из CRM-эпизода, метка LLM не влияет', () => {
        const withLabel = buildLevers(
            baseInput({
                objections: [
                    {
                        ...OBJECTION,
                        llmLabel: {
                            handled: { s: 1, n: 30 },
                            unhandled: { s: 29, n: 40 },
                        },
                    },
                ],
            }),
        );
        const withoutLabel = buildLevers(
            baseInput({ objections: [OBJECTION] }),
        );
        expect(withLabel).toEqual(withoutLabel);
        expect(withLabel[0].deltaSales as number).toBeCloseTo(
            (18 / 30 - 10 / 40) * 20 * 0.2,
            10,
        );
        expect(withLabel[0].basis[0]).toContain('CRM');
    });

    it('до сцепки со сделкой — E0 без ожидаемого эффекта', () => {
        const levers = buildLevers(
            baseInput({
                chainLinked: false,
                checklist: [CHECKLIST],
                objections: [OBJECTION],
            }),
        );
        expect(levers).toHaveLength(2);
        for (const lever of levers) {
            expect(lever.deltaSales).toBeNull();
            expect(lever.ci80).toBeNull();
            expect(lever.evidence).toBe('E0');
            expect(lever.adviceAllowed).toBe(false);
        }
    });

    it('уровень доказательности приходит из дизайна', () => {
        const e1 = buildLevers(
            baseInput({ evidence: E1_EVIDENCE, objections: [OBJECTION] }),
        );
        expect(e1[0].evidence).toBe('E1');
        expect(e1[0].adviceAllowed).toBe(false);
        const e2 = buildLevers(baseInput({ objections: [OBJECTION] }));
        expect(e2[0].evidence).toBe('E2');
        expect(e2[0].adviceAllowed).toBe(true);
    });
});

describe('уровни доказательности и формулировки', () => {
    it('лестница E0 → E1 → E2 → E3', () => {
        expect(evidenceLevelFor({ n: 4, hasInterval: false })).toBe('E0');
        expect(evidenceLevelFor(E1_EVIDENCE)).toBe('E1');
        expect(evidenceLevelFor(E2_EVIDENCE)).toBe('E2');
        expect(
            evidenceLevelFor({ ...E2_EVIDENCE, preregisteredExperiment: true }),
        ).toBe('E3');
    });

    it('непройденное плацебо и малый пул опускают уровень', () => {
        expect(evidenceLevelFor({ ...E1_EVIDENCE, placeboPassed: false })).toBe(
            'E0',
        );
        expect(
            evidenceLevelFor({
                ...E2_EVIDENCE,
                pool: {
                    ...POOL,
                    portals: EVIDENCE_DEFAULTS.minPoolPortals - 1,
                },
            }),
        ).toBe('E1');
    });

    it('совет «что менять» разрешён с E2', () => {
        expect(adviceAllowed('E1')).toBe(false);
        expect(adviceAllowed('E2')).toBe(true);
        expect(adviceAllowed('E1', 'E1')).toBe(true);
    });

    it('при E1 фраза без императива «делай X вместо Y»', () => {
        const phrase = phraseFor('E1', {
            metric: 'ниже нормы по PRICE',
            value: '6,4',
            n: 24,
            linkedTo: 'долей КП в окне 14 дней',
            action: 'разбирать цену в конце',
            instead: 'озвучивать цену первой',
        });
        expect(hasImperative(phrase)).toBe(false);
        expect(phrase).toContain('в данных это связано с');
        expect(phrase).not.toContain('значимо');
    });

    it('при E2 императив разрешён, слово «значимо» не используется', () => {
        const phrase = phraseFor('E2', {
            metric: 'ниже нормы по PRICE',
            n: 24,
            action: 'разбирать цену в конце',
            instead: 'озвучивать цену первой',
        });
        expect(hasImperative(phrase)).toBe(true);
        expect(phrase).toContain('вместо');
        expect(phrase).not.toContain('значимо');
    });

    it('E0 — только факт с n', () => {
        const phrase = phraseFor('E0', {
            metric: 'доля КП',
            value: '18 %',
            n: 40,
        });
        expect(phrase).toBe('доля КП: 18 % при n = 40');
        expect(hasImperative(phrase)).toBe(false);
    });
});
