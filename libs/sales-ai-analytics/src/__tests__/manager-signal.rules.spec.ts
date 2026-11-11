import {
    CALL_MISTAKE_SIGNAL_KINDS,
    CALL_MISTAKE_SIGNAL_TITLES,
    ManagerSignalCallView,
    PRESENTATION_NO_SSV_MAX_SCORE,
    resolveManagerSignal,
} from '../model/manager-signal.rules';
import { riskTitleOf } from '../model/dictionary-titles.util';
import { isActiveRiskKind } from '../model/attention.rules';

const view = (
    overrides: Partial<ManagerSignalCallView> = {},
): ManagerSignalCallView => ({
    riskFlags: [],
    riskEvidence: [],
    objections: [],
    sections: [],
    presentationDone: null,
    needsFound: null,
    spiralsFull: null,
    ...overrides,
});

const ALL_FLAGS = ['conflict', 'compliance', 'door_closed'] as const;
const CRM_FLAGS = ['conflict', 'compliance'] as const;

const objection = (
    overrides: Partial<ManagerSignalCallView['objections'][number]> = {},
) => ({
    quote: 'Дорого у вас',
    handled: null,
    outcome: null,
    reaction: null,
    ...overrides,
});

const section = (
    code: string,
    score: number | null,
    asWas: string | null = null,
    relevance = 100,
) => ({ section: code, relevance, score, asWas });

/**
 * Решение владельца 11.11.2026: возражение клиента — норма агрессивного
 * b2b, сигнал — ошибка менеджера.
 */
describe('resolveManagerSignal — возражения', () => {
    it('возражение само по себе — не сигнал', () => {
        expect(
            resolveManagerSignal(
                view({
                    objections: [
                        objection(),
                        objection({ handled: true, outcome: 'continued' }),
                    ],
                }),
                ALL_FLAGS,
            ),
        ).toBeNull();
    });

    it('не отработано, но менеджер уточнял и разговор продолжился — не сигнал', () => {
        expect(
            resolveManagerSignal(
                view({
                    objections: [
                        objection({
                            handled: false,
                            reaction: 'clarify',
                            outcome: 'continued',
                        }),
                    ],
                }),
                ALL_FLAGS,
            ),
        ).toBeNull();
    });

    it('не ответил по существу — сигнал с цитатой клиента', () => {
        expect(
            resolveManagerSignal(
                view({
                    objections: [
                        objection({ handled: true, quote: 'другое' }),
                        objection({
                            handled: false,
                            reaction: 'other',
                            quote: ' Нам больше нравится конкурент ',
                        }),
                    ],
                }),
                ALL_FLAGS,
            ),
        ).toEqual({
            kind: 'objection_mishandled',
            quote: ' Нам больше нравится конкурент ',
            quoteSource: 'client',
            detail: 'менеджер не ответил по существу',
        });
    });

    it('клиент ушёл из разговора после ответа — сигнал', () => {
        const signal = resolveManagerSignal(
            view({
                objections: [
                    objection({
                        handled: false,
                        reaction: 'answer',
                        outcome: 'disengaged',
                        quote: '  ',
                    }),
                ],
            }),
            ALL_FLAGS,
        );
        expect(signal?.kind).toBe('objection_mishandled');
        expect(signal?.detail).toBe('клиент после этого ушёл из разговора');
        expect(signal?.quote).toBeNull();
    });
});

describe('resolveManagerSignal — риск-флаги', () => {
    const evidence = [
        { flag: 'compliance', quote: 'Обещаю скидку 50 %' },
        { flag: 'door_closed', quote: 'Ну и ладно, до свидания' },
    ];

    it('флаг с цитатой важнее возражения; флаги — по порядку справочника', () => {
        expect(
            resolveManagerSignal(
                view({
                    riskFlags: ['door_closed', 'compliance'],
                    riskEvidence: evidence,
                    objections: [
                        objection({ handled: false, reaction: 'other' }),
                    ],
                }),
                ALL_FLAGS,
            ),
        ).toEqual({
            kind: 'compliance',
            quote: 'Обещаю скидку 50 %',
            quoteSource: 'evidence',
            detail: null,
        });
    });

    it('флаг не из набора (door_closed в CRM) — идём к следующим правилам', () => {
        expect(
            resolveManagerSignal(
                view({
                    riskFlags: ['door_closed'],
                    riskEvidence: evidence,
                }),
                CRM_FLAGS,
            ),
        ).toBeNull();
    });

    it('флаг без цитаты и отменённый флаг — не сигнал', () => {
        expect(
            resolveManagerSignal(
                view({
                    riskFlags: ['conflict', 'promise'],
                    riskEvidence: [{ flag: 'promise', quote: 'перезвоню' }],
                }),
                ALL_FLAGS,
            ),
        ).toBeNull();
    });
});

describe('resolveManagerSignal — показ', () => {
    it('показа не было — правила показа не применяются', () => {
        expect(
            resolveManagerSignal(
                view({
                    presentationDone: false,
                    needsFound: false,
                    spiralsFull: 0,
                }),
                ALL_FLAGS,
            ),
        ).toBeNull();
    });

    it('показ без выявленных потребностей — цитата раздела потребностей, иначе показа', () => {
        expect(
            resolveManagerSignal(
                view({
                    presentationDone: true,
                    needsFound: false,
                    sections: [
                        section('PRESENTATION', 2, 'Вот поиск, вот кодексы'),
                        section('NEEDS', 1, 'Давайте я сразу покажу'),
                    ],
                }),
                ALL_FLAGS,
            ),
        ).toEqual({
            kind: 'presentation_no_needs',
            quote: 'Давайте я сразу покажу',
            quoteSource: 'manager',
            detail: null,
        });
        expect(
            resolveManagerSignal(
                view({
                    presentationDone: true,
                    needsFound: false,
                    sections: [
                        section('NEEDS', 1, 'неприменимо', 0),
                        section('PRESENTATION', 2, 'Вот поиск'),
                    ],
                }),
                ALL_FLAGS,
            )?.quote,
        ).toBe('Вот поиск');
    });

    it('потребности неизвестны (null) — не «без потребностей»', () => {
        expect(
            resolveManagerSignal(
                view({ presentationDone: true, needsFound: null }),
                ALL_FLAGS,
            ),
        ).toBeNull();
    });

    it('по методике: ни одного полного витка — без С-С-В', () => {
        const signal = resolveManagerSignal(
            view({
                presentationDone: true,
                needsFound: true,
                spiralsFull: 0,
                sections: [
                    section('PRESENTATION', 8, 'Поиск по вашим закупкам'),
                ],
            }),
            ALL_FLAGS,
        );
        expect(signal).toEqual({
            kind: 'presentation_no_ssv',
            quote: 'Поиск по вашим закупкам',
            quoteSource: 'manager',
            detail: 'ни одного полного витка «потребность → свойство → связка → выгода → вопрос»',
        });
    });

    it('по методике есть полный виток — не сигнал, даже при низкой оценке раздела', () => {
        expect(
            resolveManagerSignal(
                view({
                    presentationDone: true,
                    needsFound: true,
                    spiralsFull: 1,
                    sections: [section('PRESENTATION', 2)],
                }),
                ALL_FLAGS,
            ),
        ).toBeNull();
    });

    it('без методики: раздел «Презентация под потребности» на пороге и ниже', () => {
        const at = (score: number | null, relevance = 100) =>
            resolveManagerSignal(
                view({
                    presentationDone: true,
                    needsFound: true,
                    sections: [section('PRESENTATION', score, null, relevance)],
                }),
                ALL_FLAGS,
            );
        expect(at(PRESENTATION_NO_SSV_MAX_SCORE)?.detail).toBe(
            `«Презентация под потребности» — ${PRESENTATION_NO_SSV_MAX_SCORE} из 10`,
        );
        expect(at(PRESENTATION_NO_SSV_MAX_SCORE + 1)).toBeNull();
        expect(at(null)).toBeNull();
        expect(at(1, 0)).toBeNull();
    });

    it('не отработанное возражение важнее ошибок показа', () => {
        expect(
            resolveManagerSignal(
                view({
                    presentationDone: true,
                    needsFound: false,
                    objections: [
                        objection({ handled: false, outcome: 'disengaged' }),
                    ],
                }),
                ALL_FLAGS,
            )?.kind,
        ).toBe('objection_mishandled');
    });
});

describe('виды ошибок менеджера в текстах и «Внимании»', () => {
    it('у каждой ошибки есть русская подпись, и «Внимание» их считает', () => {
        for (const kind of CALL_MISTAKE_SIGNAL_KINDS) {
            expect(CALL_MISTAKE_SIGNAL_TITLES[kind]).toMatch(/[а-яё]/i);
            expect(riskTitleOf(kind)).not.toBe(kind);
            expect(isActiveRiskKind(kind)).toBe(true);
        }
    });
});
