import 'reflect-metadata';
import type { PlanFactRow } from '@lib/sales-ai-analytics';
import {
    AI_PLAN_FACT_REASONS,
    AI_PLAN_FACT_REASON_TEXTS,
} from '../constants/ai-plan-fact.const';
import type { RequesterAccess } from '../domain/access/perimeter.util';
import type { PlanFactView } from '../domain/assembler/plan-fact.assembler';
import {
    presentPlanFact,
    presentRow,
    reasonsOf,
} from '../domain/presenter/plan-fact.presenter';

/**
 * Презентер реконсиляции план-факт (Фаза 3, П2): периметр применяется на
 * отдаче, причины деградации получают человеческие подписи.
 */
const row = (overrides: Partial<PlanFactRow> = {}): PlanFactRow => ({
    indicator: 'sales',
    plan: 10,
    fact: 5,
    pace: 1,
    forecastP50: 10,
    gap: 0,
    perDayNeeded: 0.5,
    status: 'on-track',
    reasons: [],
    ...overrides,
});

const view = (overrides: Partial<PlanFactView> = {}): PlanFactView => ({
    monthKey: '2026-09',
    exposure: {
        workdaysInMonth: 22,
        workdaysElapsed: 11,
        dailyPlanEnabled: true,
    },
    managers: [
        { managerId: '11', rows: [row()] },
        { managerId: '12', rows: [row({ fact: 4 })] },
    ],
    team: [row({ plan: 16, fact: 9 })],
    hasPlanSnapshot: true,
    hasMonthSnapshots: true,
    ...overrides,
});

const all: RequesterAccess = { role: 'cup', visibleManagerIds: null };
const limited: RequesterAccess = { role: 'group', visibleManagerIds: ['12'] };

describe('presentRow', () => {
    it('строка копируется целиком, причины — новый массив', () => {
        const source = row({ reasons: ['target-empty'] });
        const dto = presentRow(source);
        expect(dto).toEqual({ ...source, reasons: ['target-empty'] });
        expect(dto.reasons).not.toBe(source.reasons);
    });
});

describe('reasonsOf', () => {
    it('данные полные — причин нет', () => {
        expect(reasonsOf(view(), true)).toEqual([]);
    });

    it('нет снимка целей и месяцев — обе причины в порядке объявления', () => {
        expect(
            reasonsOf(
                view({ hasPlanSnapshot: false, hasMonthSnapshots: false }),
                true,
            ),
        ).toEqual([
            AI_PLAN_FACT_REASONS.planSnapshotMissing,
            AI_PLAN_FACT_REASONS.monthSnapshotsMissing,
        ]);
    });

    it('признак «План дня» выключен — своя причина', () => {
        expect(reasonsOf(view(), false)).toEqual([
            AI_PLAN_FACT_REASONS.dailyPlanDisabled,
        ]);
    });
});

describe('presentPlanFact', () => {
    it('видящему всех — все строки и период из экспозиции', () => {
        const dto = presentPlanFact(view(), all, {
            today: '2026-09-15',
            closed: false,
        });
        expect(dto.rows.map(item => item.managerId)).toEqual(['11', '12']);
        expect(dto.period).toEqual({
            monthKey: '2026-09',
            workdaysInMonth: 22,
            workdaysElapsed: 11,
            today: '2026-09-15',
            closed: false,
        });
        expect(dto.team).toHaveLength(1);
        expect(dto.reasons).toEqual([]);
        expect(dto.reasonTexts).toEqual([]);
    });

    it('узкий периметр — чужие строки не отдаются, свод отдела остаётся', () => {
        const dto = presentPlanFact(view(), limited, {
            today: '2026-09-30',
            closed: true,
        });
        expect(dto.rows.map(item => item.managerId)).toEqual(['12']);
        expect(dto.team[0].fact).toBe(9);
        expect(dto.period.closed).toBe(true);
    });

    it('подписи причин берутся из справочника и идут в том же порядке', () => {
        const dto = presentPlanFact(
            view({
                hasPlanSnapshot: false,
                exposure: {
                    workdaysInMonth: 22,
                    workdaysElapsed: 11,
                    dailyPlanEnabled: false,
                },
            }),
            all,
            { today: '2026-09-15', closed: false },
        );
        expect(dto.reasons).toEqual([
            AI_PLAN_FACT_REASONS.planSnapshotMissing,
            AI_PLAN_FACT_REASONS.dailyPlanDisabled,
        ]);
        expect(dto.reasonTexts).toEqual([
            AI_PLAN_FACT_REASON_TEXTS[AI_PLAN_FACT_REASONS.planSnapshotMissing],
            AI_PLAN_FACT_REASON_TEXTS[AI_PLAN_FACT_REASONS.dailyPlanDisabled],
        ]);
    });
});
