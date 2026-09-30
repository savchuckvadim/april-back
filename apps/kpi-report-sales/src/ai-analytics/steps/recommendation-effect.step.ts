/**
 * Шаг конвейера «эффект советов» (план §4.10, §10 L5; Фаза 4, поток B2b):
 * раз в месяц по закрытому месяцу (и в догоне истории) считает, что
 * стало после советов.
 *
 * Окно: советы месяца `M = monthKey − lever_effect_months_after` — к
 * месяцу расчёта окно «после» закрыто. Выданные советы — журнал
 * `recommendation_issued` за M; «Сделано» — `recommendation_done` по тому
 * же объекту в [M; M + after]; несогласие — `disagree` с объектом совета.
 * «До/после» — рёбра «презентация → КП» и «КП → счёт» из месячных
 * снапшотов менеджера за [M − before; M − 1] и [M + 1; M + after]; контроль
 * подгонки — флаги Гудхарта из последних трендов. Оценка — библиотека
 * (`buildRecommendationEffect`), это прокси, а не доказательство причины.
 *
 * Советов за месяц выдачи нет — пропуск с причиной, запись не создаётся
 * (иначе догон старых месяцев заслонил бы свежий расчёт).
 *
 * ⚠ Идемпотентность: `upsert` по ключу месяца расчёта; расчёт
 * детерминирован, повтор с той же сигнатурой ничего не пишет.
 *
 * `@Injectable` без bitrix-состояния: всё читается из `ais`.
 */
import { Injectable } from '@nestjs/common';
import { AI_ANALYTICS_SNAPSHOT_TYPE } from '@lib/sales-ai-analytics';
import {
    AI_RECOMMENDATION_EFFECT_EDGES,
    AI_RECOMMENDATION_EFFECT_RHYTHMS,
    AI_RECOMMENDATION_EFFECT_STEP_CODE,
    AI_RECOMMENDATION_REASONS,
} from '../constants/ai-recommendation-effect.const';
import {
    buildRecommendationEffectSnapshot,
    issuedRecommendationsOf,
} from '../domain/assembler/recommendation-effect.assembler';
import { PortalModelLoader } from '../domain/loaders/portal-model.loader';
import { AiAnalyticsRecommendationLogStore } from '../store/ai-analytics-recommendation-log.store';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import {
    effectParamsOf,
    effectWindowOf,
    goodhartOf,
    goodhartWeekKeys,
} from './recommendation-effect.facts';
import {
    AiAnalyticsPipelineStep,
    AiPipelineStepContext,
    AiPipelineStepResult,
    stepOk,
    stepSkipped,
} from './step.types';

@Injectable()
export class RecommendationEffectStep implements AiAnalyticsPipelineStep {
    readonly code = AI_RECOMMENDATION_EFFECT_STEP_CODE;
    readonly rhythms = AI_RECOMMENDATION_EFFECT_RHYTHMS;
    /** Теневой шаг: сбой источника не обрывает прогон (раннер — пропуск). */
    readonly optional = true;

    constructor(
        private readonly log: AiAnalyticsRecommendationLogStore,
        private readonly loader: PortalModelLoader,
        private readonly snapshots: AiAnalyticsSnapshotStore,
    ) {}

    async run(ctx: AiPipelineStepContext): Promise<AiPipelineStepResult> {
        const startedAt = Date.now();
        if (ctx.managerIds.length === 0) {
            return stepSkipped(
                this.code,
                AI_RECOMMENDATION_REASONS.rosterEmpty,
                { ms: Date.now() - startedAt },
            );
        }
        const roster = ctx.managerIds.map(String);
        const window = effectWindowOf(ctx.monthKey, ctx.registry);
        const journal = await this.log.readWindow(
            ctx.domain,
            window.issuedMonth,
            ctx.monthKey,
        );
        const allowed = new Set(roster);
        const issued = journal.issued.filter(item =>
            allowed.has(item.managerId),
        );
        if (issued.length === 0) {
            return stepSkipped(this.code, AI_RECOMMENDATION_REASONS.noIssued, {
                ms: Date.now() - startedAt,
            });
        }
        const months = await this.loader.loadMonths(ctx.domain, [
            ...window.beforeMonths,
            ...window.afterMonths,
        ]);
        const trends = await this.snapshots.findByKeys(
            ctx.domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.trends,
            {
                periodKeys: goodhartWeekKeys(ctx.monthKey),
                managerIds: roster,
                latestOnly: true,
            },
        );
        const payload = buildRecommendationEffectSnapshot({
            monthKey: ctx.monthKey,
            issuedMonth: window.issuedMonth,
            issued: issuedRecommendationsOf({
                issued,
                done: journal.done,
                disagree: journal.disagree,
                months,
                beforeMonths: window.beforeMonths,
                afterMonths: window.afterMonths,
                edges: AI_RECOMMENDATION_EFFECT_EDGES,
            }),
            params: effectParamsOf(ctx.registry),
            goodhart: goodhartOf(trends, roster),
            meta: {
                calcVersion: ctx.calcVersion,
                paramsVersion: ctx.paramsVersion,
                comparableFrom: ctx.comparableFrom || null,
                generatedAt: ctx.now.toISOString(),
                modelSnapshotId: null,
            },
        });
        const result = await this.snapshots.upsert(
            {
                domain: ctx.domain,
                type: AI_ANALYTICS_SNAPSHOT_TYPE.recommendationEffect,
                periodKey: ctx.monthKey,
                managerId: null,
                calcVersion: ctx.calcVersion,
                paramsVersion: ctx.paramsVersion,
                inputsHash: ctx.inputsHash,
                generatedAt: ctx.now.toISOString(),
                payload,
            },
            { force: ctx.forceRefresh },
        );

        return stepOk(this.code, {
            ms: Date.now() - startedAt,
            rows: issued.length,
            written: result.written,
        });
    }
}
