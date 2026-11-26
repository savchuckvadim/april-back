import { CORE_CAPS } from '../core-caps.const';
import { evaluateMethodology } from '../methodology-evaluate';
import type {
    MethodologyAnalysisView,
    MethodologyPassRaw,
} from '../methodology-result.types';
import type {
    Methodology,
    MethodologyCap,
    MethodologyCheckpoint,
} from '../methodology.types';

/**
 * Образцы для проверок обрыва связи в методике: срез разбора с шагом без
 * даты, методика-образец с ограничителями разной цели и пунктами о конце
 * разговора. Общие для файлов methodology-connection-lost.*.spec.ts.
 */
export const view = (
    over: Partial<MethodologyAnalysisView> = {},
): MethodologyAnalysisView => ({
    callType: 'presentation',
    sections: [
        { section: 'PRESENTATION', relevance: 90, score: 9 },
        { section: 'CLOSING', relevance: 90, score: 8 },
        { section: 'PRICE', relevance: 80, score: 9 },
    ],
    score: 8,
    needsFound: true,
    presentationDone: true,
    priceDiscussed: true,
    // Шаг назначен, но без даты, времени и цели; выход на решение не выяснен.
    nextStep: { set: true, date: null, time: null, goal: null },
    hvostSteps: { decisionProcess: false, decisionWay: false },
    ...over,
});

export const LOST = { connectionLost: true } as const;
export const NOT_LOST = { connectionLost: false } as const;

export const codesOf = (result: ReturnType<typeof evaluateMethodology>) =>
    result.capsTriggered.map(cap => cap.code);

export const coreOnly = (analysis: MethodologyAnalysisView) =>
    evaluateMethodology({
        view: analysis,
        methodology: null,
        pass: null,
        coreCaps: CORE_CAPS,
        norms: {},
    });

/** Методика-образец: ограничители с разной целью и условиями, пункты о конце. */
export const cap = (
    code: string,
    target: MethodologyCap['target'],
    when: MethodologyCap['when'],
    max = 5,
): MethodologyCap => ({ code, title: code, target, when, max });

export const point = (
    code: string,
    over: Partial<MethodologyCheckpoint> = {},
): MethodologyCheckpoint => ({
    code,
    title: code,
    types: ['presentation'],
    evidence: 'quote',
    mandatory: true,
    ...over,
});

export const METHODOLOGY: Methodology = {
    code: 'own',
    title: 'Своя',
    version: '1.0.0',
    types: ['presentation'],
    principles: [],
    spirals: { enabled: false, minFull: 0, types: [] },
    checkpoints: [
        point('end.summary', { ending: true }),
        point('mid.needs'),
        point('end.step_rule', {
            evidence: 'fact',
            rule: [{ op: 'is', field: 'nextStepComplete', value: true }],
        }),
        point('mid.rule', {
            evidence: 'fact',
            rule: [{ op: 'is', field: 'needsFound', value: false }],
        }),
    ],
    caps: [
        cap('t.target_closing', 'CLOSING', [
            { op: 'is', field: 'priceDiscussed', value: true },
        ]),
        cap('t.target_refusal', 'REFUSAL', [
            { op: 'is', field: 'priceDiscussed', value: true },
        ]),
        cap('t.total_step_date', 'total', [
            { op: 'empty', field: 'nextStepDate' },
        ]),
        cap('t.summary_missed', 'PRESENTATION', [
            { op: 'checkpoint_missed', checkpoint: 'end.summary' },
        ]),
        cap('t.price_plain', 'PRICE', [
            { op: 'is', field: 'priceDiscussed', value: true },
        ]),
    ],
};

export const pass = (
    statuses: Record<string, 'done' | 'missed'>,
): MethodologyPassRaw => ({
    checkpoints: Object.entries(statuses).map(([code, status]) => ({
        code,
        status,
        quote: null,
        startSec: null,
        endSec: null,
    })),
    spirals: null,
});

export const evaluate = (
    analysis: MethodologyAnalysisView,
    answers: Record<string, 'done' | 'missed'> = {
        'end.summary': 'missed',
        'mid.needs': 'missed',
    },
) =>
    evaluateMethodology({
        view: analysis,
        methodology: METHODOLOGY,
        pass: pass(answers),
        coreCaps: [],
        norms: {},
    });
