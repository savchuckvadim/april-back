/**
 * Недельная санити-панель калибровочного контура (план Фазы 2, §4.11 и
 * поток 12): шаг конвейера с ритмом `weekly`, который сверяет решения
 * людей с фактами и объясняет расхождения словами, а не числом.
 *
 * Правила (по одному кейсу на правило в спеке): цель уровня против
 * медианы факта полосы стажа; договорённости об SLA против фактических
 * квантилей сроков; пороги длительности против фактических длительностей
 * типа («порог отрезает > 25 % звонков типа»); шум алертов; «на год нет
 * праздников»; менеджер-месяцы с прокси-отсутствиями. Сами правила —
 * чистые функции в `sanity.rules.ts`, словарь — в `sanity.types.ts`.
 *
 * Результат уезжает в предупреждения журнала прогона (поле `warnings`
 * результата шага) и в поле `sanity` снапшота `ai-analytics-portal-model`.
 * ⚠ Ложная тревога хуже молчания: при нехватке наблюдений правило
 * пропускается с причиной (порог — `n_min_none` реестра).
 */
import { Injectable } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    resolveNumberParam,
} from '@lib/sales-ai-analytics';
import {
    AI_PIPELINE_BUS_KEYS,
    previousMonthKey,
} from '../constants/ai-snapshot.const';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import {
    agreedSla,
    callFacts,
    exposureFacts,
    levelFactOf,
    modelPayloadOf,
    slaFacts,
} from './sanity.facts';
import {
    alertsRule,
    calendarRule,
    durationRule,
    exposureRule,
    slaRule,
    targetRule,
} from './sanity.rules';
import {
    AI_SANITY_LIMITS,
    AI_SANITY_RULES,
    AI_SANITY_SKIP_REASONS,
    AI_SANITY_STEP_CODE,
    AI_SANITY_STEP_RHYTHMS,
    AiSanityReport,
    AiSanityStepResult,
    SanityLevelFact,
} from './sanity.types';
import {
    AiAnalyticsPipelineStep,
    AiPipelineStepContext,
    StepBus,
    stepOk,
    stepSkipped,
} from './step.types';

/**
 * Панели не на чем работать: все правила, зависящие от фактов, пропущены,
 * а календарь молчит. Такой прогон честнее показать в журнале «частично»
 * с причиной, чем зелёным «ok» без единой проверки.
 */
function isSilent(report: AiSanityReport): boolean {
    return (
        report.warnings.length === 0 &&
        report.rules
            .filter(rule => rule.rule !== AI_SANITY_RULES.calendar)
            .every(rule => rule.status === 'skipped')
    );
}

@Injectable()
export class SanityStep implements AiAnalyticsPipelineStep {
    readonly code = AI_SANITY_STEP_CODE;
    readonly rhythms = AI_SANITY_STEP_RHYTHMS;

    constructor(private readonly snapshots: AiAnalyticsSnapshotStore) {}

    async run(
        ctx: AiPipelineStepContext,
        bus: StepBus,
    ): Promise<AiSanityStepResult> {
        const startedAt = Date.now();
        const minN =
            resolveNumberParam('n_min_none', ctx.registry) ??
            AI_SANITY_LIMITS.minObservations;
        const rows = callFacts(bus.get(AI_PIPELINE_BUS_KEYS.callsRows));
        const rules = [
            targetRule(ctx.settings.targets, await this.levelFacts(ctx), minN),
            slaRule(
                agreedSla(ctx.settings.modelParams),
                slaFacts(bus.get(AI_PIPELINE_BUS_KEYS.slaFacts)),
                minN,
            ),
            durationRule(
                ctx.settings.definitions.minDurationSecByType,
                rows,
                minN,
            ),
            alertsRule(rows, minN),
            calendarRule(ctx.calendar, ctx.day),
            exposureRule(exposureFacts(bus.get(AI_PIPELINE_BUS_KEYS.exposure))),
        ];
        const report: AiSanityReport = {
            day: ctx.day,
            weekKey: ctx.weekKey,
            generatedAt: ctx.now.toISOString(),
            rules,
            warnings: rules.flatMap(rule => rule.warnings),
        };
        const written = await this.attach(ctx, report);
        const values = {
            ms: Date.now() - startedAt,
            rows: rows.length,
            written,
        };
        const result = isSilent(report)
            ? stepSkipped(this.code, AI_SANITY_SKIP_REASONS.noData, values)
            : stepOk(this.code, values);
        return { ...result, warnings: report.warnings, report };
    }

    /** Факты менеджер-месяцев за последние месяцы (медиана полосы стажа). */
    private async levelFacts(
        ctx: AiPipelineStepContext,
    ): Promise<SanityLevelFact[]> {
        const months: string[] = [];
        let cursor = `${ctx.monthKey}-01`;
        for (let index = 0; index < AI_SANITY_LIMITS.factMonths; index += 1) {
            const month = previousMonthKey(cursor);
            months.push(month);
            cursor = `${month}-01`;
        }
        const records = await this.snapshots.findByKeys(
            ctx.domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            { periodKeys: months },
        );
        return records.flatMap(record => levelFactOf(record.payload));
    }

    /**
     * Отчёт в поле `sanity` последнего снапшота модели портала. Модели
     * ещё нет (первый месяц портала) — это не ошибка шага: панель
     * добавляет оговорку и остаётся в журнале прогона.
     */
    private async attach(
        ctx: AiPipelineStepContext,
        report: AiSanityReport,
    ): Promise<number> {
        const record = await this.snapshots.latest(
            ctx.domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.portalModel,
            null,
        );
        const payload = modelPayloadOf(record?.payload);
        if (!record || !payload) {
            report.warnings.push(
                'Санити-отчёт не приложен к модели портала: снапшота ' +
                    'ai-analytics-portal-model ещё нет',
            );
            return 0;
        }
        await this.snapshots.upsert({
            domain: record.domain,
            type: record.type,
            periodKey: record.periodKey,
            managerId: record.managerId,
            calcVersion: record.calcVersion,
            paramsVersion: record.paramsVersion,
            inputsHash: record.inputsHash,
            generatedAt: ctx.now.toISOString(),
            payload: { ...payload, sanity: report },
        });
        return 1;
    }
}
