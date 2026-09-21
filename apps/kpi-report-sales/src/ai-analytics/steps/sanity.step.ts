/**
 * Санити-панель калибровочного контура (план Фазы 2, §4.11 и поток 12):
 * шаг конвейера с ритмами `weekly` и `monthly`, который сверяет решения
 * людей с фактами и объясняет расхождения словами, а не числом.
 *
 * Правила (по одному кейсу на правило в спеке): цель уровня против
 * медианы факта полосы стажа; договорённости об SLA против фактических
 * квантилей сроков; пороги длительности против фактических длительностей
 * типа («порог отрезает > 25 % звонков типа»); шум алертов; «на год нет
 * праздников»; менеджер-месяцы с прокси-отсутствиями; плацебо-тест меток
 * времени. Сами правила — чистые функции в `sanity.rules.ts`, словарь — в
 * `sanity.types.ts`, разбор шины — `sanity.facts.ts`/`sanity.sources.ts`.
 *
 * Откуда факты (аудит M1): сроки стадий и плацебо-тест — из шины, шаг
 * истории стадий объявляет ритм `weekly` (окно кэшируется по дню);
 * уровни и экспозиция — из месячных снапшотов менеджеров через стор.
 *
 * Куда результат (аудит N1): предупреждения — в `etl-run.warnings` (поле
 * `warnings` результата шага), отчёт с готовностью — в шину под ключом
 * `sanity`, откуда его берёт месячная модель портала того же прогона.
 * Снапшотов панель НЕ пишет и чужих записей не переписывает.
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
import { portalMinDurationByType } from '../domain/loaders/min-duration.util';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import { agreedSla, callFacts, slaFacts } from './sanity.facts';
import {
    alertsRule,
    buildSanityReadiness,
    calendarRule,
    durationRule,
    exposureRule,
    slaRule,
    targetRule,
    timestampLeakRule,
} from './sanity.rules';
import {
    leakFactOf,
    monthFactsOf,
    type SanityMonthFacts,
} from './sanity.sources';
import {
    AI_SANITY_LIMITS,
    AI_SANITY_RULES,
    AI_SANITY_SKIP_REASONS,
    AI_SANITY_STEP_CODE,
    AI_SANITY_STEP_RHYTHMS,
    AiSanityReport,
    AiSanityStepResult,
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
        const months = await this.monthFacts(ctx);
        const leak = leakFactOf(bus.get(AI_PIPELINE_BUS_KEYS.timestampLeak));
        const rules = [
            targetRule(ctx.settings.targets, months.levels, minN),
            slaRule(
                agreedSla(ctx.settings.modelParams),
                slaFacts(bus.get(AI_PIPELINE_BUS_KEYS.slaFacts)),
                minN,
            ),
            durationRule(
                // Один вход порога у пульса, конвейера и панели (решение
                // А.1, P2-56): общий резолвер учитывает и явный скаляр
                // min_duration_sec, и признак сырого ключа настроек —
                // своя сборка карты здесь разошлась бы с остальными.
                portalMinDurationByType(ctx.settings),
                rows,
                minN,
            ),
            alertsRule(rows, minN),
            calendarRule(ctx.calendar, ctx.day),
            exposureRule(months.exposure),
            timestampLeakRule(leak, minN),
        ];
        const report: AiSanityReport = {
            day: ctx.day,
            weekKey: ctx.weekKey,
            generatedAt: ctx.now.toISOString(),
            rules,
            warnings: rules.flatMap(rule => rule.warnings),
            readiness: buildSanityReadiness(rules, leak),
        };
        bus.set<AiSanityReport>(AI_PIPELINE_BUS_KEYS.sanity, report);
        const values = {
            ms: Date.now() - startedAt,
            rows: rows.length,
            written: 0,
        };
        const result = isSilent(report)
            ? stepSkipped(this.code, AI_SANITY_SKIP_REASONS.noData, values)
            : stepOk(this.code, values);
        return { ...result, warnings: report.warnings, report };
    }

    /**
     * Факты менеджер-месяцев за последние месяцы одним чтением стора:
     * уровни (медиана полосы стажа) и экспозиция (прокси-отсутствия).
     */
    private async monthFacts(
        ctx: AiPipelineStepContext,
    ): Promise<SanityMonthFacts> {
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
        return monthFactsOf(records);
    }
}
