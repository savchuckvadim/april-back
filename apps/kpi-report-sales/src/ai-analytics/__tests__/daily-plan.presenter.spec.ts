import type { DailyPlanItem } from '@lib/sales-ai-analytics';
import type { DailyPlanView } from '../domain/assembler/daily-plan-input.types';
import type { RequesterAccess } from '../domain/access/perimeter.util';
import { presentDailyPlan } from '../domain/presenter/daily-plan.presenter';

/**
 * Тексты объяснения плана дня — словами (правило владельца): без формул,
 * обозначений (G, Y₀, λ, N_req) и кодов рёбер; числа шагов — из DTO.
 */
const leader: RequesterAccess = { role: 'op', visibleManagerIds: null };

const item = (
    callType: string,
    monthPlan: number,
    requiredToday: number,
    priority: number,
): DailyPlanItem => ({
    callType,
    requiredToday,
    doneToday: 0,
    monthPlan,
    monthDone: 0,
    cap: null,
    priority,
    leak: null,
    ceiling: requiredToday,
    cappedByCeiling: false,
    trainingApplied: false,
    unreachable: false,
});

const view = (overrides: Partial<DailyPlanView> = {}): DailyPlanView => ({
    managerId: '10',
    date: '2026-09-15',
    monthKey: '2026-09',
    target: { value: 6, source: 'plan', warnings: [] },
    doneSales: 2,
    pipelineExpected: 1.2,
    requiredVolume: 190.4,
    volumeBased: false,
    daysLeft: 15,
    daysElapsed: 10,
    workdaysInMonth: 22,
    plan: {
        // Порядок строк — по приоритету, а не по воронке: текст сам
        // выстраивает воронку от входной активности.
        items: [
            item('presentation_to_offer', 40, 3, 1),
            item('call_to_presentation', 250, 12.4, 2),
            item('offer_to_invoice', 15, 1, 3),
            item('invoice_to_sale', 8, 1, 4),
        ],
        steps: [],
        budget: { minutes: 0, limitMinutes: 0, withinBudget: true },
    },
    reason: null,
    rop: {
        norm: { value: null, n: 0, confidence: { level: 'none' } },
        normAtRefQuality: null,
        betaSource: 'none',
        bindingConstraint: null,
        unreachable: null,
        gExpected: 5,
        gCeiling: 7,
        sReq: null,
    },
    ...overrides,
});

describe('presentDailyPlan — объяснение словами', () => {
    it('шаги полного расчёта: цель, закрыто, сделки в работе, объём, воронка, потолок', () => {
        const dto = presentDailyPlan(view(), leader);
        const texts = dto.explanation.steps.map(step => step.text);

        expect(texts).toEqual([
            'Цель на месяц — 6 сделок (поставил руководитель).',
            'Уже закрыто в этом месяце: 2 сделки.',
            'Из сделок, которые уже в работе, ожидаем ещё около 1 продажи.',
            'Чтобы добрать ещё 3 продажи, при нынешней конверсии воронки ' +
                'до конца месяца нужно около 190 звонков.',
            'По воронке за месяц это: звонков — 250, презентаций — 40, ' +
                'КП — 15, счетов — 8.',
            'Оставшееся делим на 15 рабочих дней, но не больше дневного ' +
                'максимума: сегодня — 12 звонков.',
        ]);
        expect(dto.explanation.text).toBe(
            'Цель на месяц — 6 сделок (поставил руководитель), уже закрыто 2, ' +
                'из сделок в работе ждём ещё около 1; чтобы добрать ещё ' +
                '3 продажи, до конца месяца нужно около 190 звонков, ' +
                'сегодня — 12 звонков.',
        );
        // Числа шагов — из самого DTO, а не из текста.
        expect(dto.explanation.steps.map(step => step.value)).toEqual([
            6, 2, 1.2, 190.4, 250, 12.4,
        ]);
    });

    it('источник цели словами: цель уровня и обычный результат коллег', () => {
        const level = presentDailyPlan(
            view({ target: { value: 4, source: 'levelTarget', warnings: [] } }),
            leader,
        );
        expect(level.explanation.steps[0].text).toBe(
            'Цель на месяц — 4 сделки (из целей по уровню).',
        );
        const median = presentDailyPlan(
            view({ target: { value: 3.4, source: 'median', warnings: [] } }),
            leader,
        );
        expect(median.explanation.steps[0].text).toBe(
            'Цель на месяц — 3 сделки (обычный результат коллег с таким же стажем).',
        );
    });

    it('без истории стадий и без прогноза — причины словами, цель не уменьшается', () => {
        const noHistory = presentDailyPlan(
            view({ pipelineExpected: null }),
            leader,
        );
        expect(noHistory.explanation.steps[2].text).toBe(
            'Сделки в работе не учитываем: нет истории движения сделок по ' +
                'стадиям — цель не уменьшаем.',
        );
        expect(noHistory.explanation.steps[3].text).toContain(
            'Чтобы добрать ещё 4 продажи',
        );
        const volumeBased = presentDailyPlan(
            view({
                pipelineExpected: null,
                requiredVolume: null,
                volumeBased: true,
                reason: 'forecast-missing',
            }),
            leader,
        );
        expect(volumeBased.explanation.steps[2].text).toBe(
            'Сделки в работе не учитываем: прогноза на эту дату нет — ' +
                'цель не уменьшаем.',
        );
        expect(volumeBased.explanation.steps[3].text).toContain('по объёму');
        expect(volumeBased.explanation.text).toContain(
            'план построен по объёму прошлого темпа',
        );
        expect(volumeBased.explanation.text).toContain(
            'Прогноз на эту дату ещё не посчитан',
        );
    });

    it('цель закрыта, строк нет — честные фразы вместо нулей и «undefined»', () => {
        const dto = presentDailyPlan(
            view({
                doneSales: 6,
                pipelineExpected: 0.2,
                requiredVolume: 0,
                plan: {
                    items: [],
                    steps: [],
                    budget: { minutes: 0, limitMinutes: 0, withinBudget: true },
                },
                reason: 'unknown-reason',
            }),
            leader,
        );
        const texts = dto.explanation.steps.map(step => step.text);

        expect(texts[2]).toBe(
            'Из сделок, которые уже в работе, дополнительных продаж пока не ожидаем.',
        );
        expect(texts[3]).toBe(
            'Цель на месяц уже закрыта: по нормам добирать нечего.',
        );
        expect(texts[4]).toBe(
            'По воронке разворачивать нечего: строк плана нет.',
        );
        expect(texts[5]).toBe(
            'Дневной максимум применять не к чему: строк плана нет.',
        );
        expect(dto.explanation.text).not.toContain('undefined');
        expect(dto.explanation.steps[4].value).toBeNull();
    });

    it('в текстах нет обозначений, формул и кодов рёбер', () => {
        const dto = presentDailyPlan(view(), leader);
        const all = [
            ...dto.explanation.steps.map(step => step.text),
            dto.explanation.text,
        ].join(' ');

        expect(all).not.toMatch(
            /λ|θ|N_req|Y₀|E\[|F̄|\/10|call_to_presentation|G:/,
        );
    });

    it('ropOnly уходит только руководителю', () => {
        const manager: RequesterAccess = {
            role: 'manager',
            visibleManagerIds: ['10'],
        };
        expect(presentDailyPlan(view(), manager).ropOnly).toBeUndefined();
        expect(presentDailyPlan(view(), leader).ropOnly).toBeDefined();
    });

    it('утечка шага доходит до строки плана; нет утечки (и старый снапшот без поля) — null', () => {
        const leaky: DailyPlanItem = {
            ...item('presentation_to_offer', 40, 3, 1),
            leak: 0.6,
        };
        const legacy = {
            ...item('call_to_presentation', 250, 12.4, 2),
            leak: undefined,
        } as unknown as DailyPlanItem;
        const base = view();
        const dto = presentDailyPlan(
            view({
                plan: {
                    ...base.plan,
                    items: [leaky, legacy, item('offer_to_invoice', 15, 1, 3)],
                },
            }),
            leader,
        );

        expect(dto.items.map(row => row.leak)).toEqual([0.6, null, null]);
    });
});
