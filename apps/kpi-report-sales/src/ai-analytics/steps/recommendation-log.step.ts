/**
 * Шаг конвейера «журнал выдачи советов» (план §4.10, §10 L5; Фаза 4,
 * поток B2b): каждую ночь после прогноза отмечает в журнале обратной
 * связи (`recommendation_issued`) каждый совет из прогноза дня
 * менеджера (`payload.levers`, не больше `lever_max`) — это и есть
 * «совет выдан». Витрина дополнительно прячет советы при числе разборов
 * за выбранный период ниже `n_min_none`; этот порог зависит от периода
 * просмотра и здесь не применяется (открытый вопрос владельцу).
 *
 * Ключ совета — `leverKeyOf` библиотеки (рычаг, правило, тип звонка,
 * раздел, категория), объект — `lever:{managerId}:{ключ}`; тот же объект
 * ставит кнопка «Сделано» и несогласие, по нему месячный шаг эффекта
 * сводит выдачу с реакциями.
 *
 * Совет с ключом, который не разбирается (неизвестный рычаг, пустое
 * правило), в журнал не идёт: витрина его не покажет, а отметку «Сделано»
 * по такому объекту ручка обратной связи не примет — он занизил бы долю
 * выполненных.
 *
 * ⚠ Идемпотентность: одна запись на (менеджер, ключ, месяц). Выданные в
 * месяце объекты читаются одним запросом до записи, повтор ночи и
 * повторный показ того же совета ничего не пишут.
 *
 * `@Injectable` без bitrix-состояния: прогнозы — из шины (или `ais`),
 * журнал — записи обратной связи в `ais`.
 */
import { Injectable } from '@nestjs/common';
import { leverKeyOf, parseLeverKey } from '@lib/sales-ai-analytics';
import {
    AI_RECOMMENDATION_LOG_RHYTHMS,
    AI_RECOMMENDATION_LOG_STEP_CODE,
    AI_RECOMMENDATION_REASONS,
} from '../constants/ai-recommendation-effect.const';
import {
    AiAnalyticsRecommendationLogStore,
    leverObject,
} from '../store/ai-analytics-recommendation-log.store';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import { loadForecastDay } from './forecast-day.facts';
import {
    AiAnalyticsPipelineStep,
    AiPipelineStepContext,
    AiPipelineStepResult,
    createStepBus,
    StepBus,
    stepOk,
    stepSkipped,
} from './step.types';

@Injectable()
export class RecommendationLogStep implements AiAnalyticsPipelineStep {
    readonly code = AI_RECOMMENDATION_LOG_STEP_CODE;
    readonly rhythms = AI_RECOMMENDATION_LOG_RHYTHMS;

    constructor(
        private readonly log: AiAnalyticsRecommendationLogStore,
        private readonly snapshots: AiAnalyticsSnapshotStore,
    ) {}

    async run(
        ctx: AiPipelineStepContext,
        bus: StepBus = createStepBus(),
    ): Promise<AiPipelineStepResult> {
        const startedAt = Date.now();
        if (ctx.managerIds.length === 0) {
            return stepSkipped(
                this.code,
                AI_RECOMMENDATION_REASONS.rosterEmpty,
                { ms: Date.now() - startedAt },
            );
        }
        const forecastDay = await loadForecastDay(ctx, bus, this.snapshots);
        if (forecastDay === null || forecastDay.managers.length === 0) {
            return stepSkipped(
                this.code,
                AI_RECOMMENDATION_REASONS.forecastDayMissing,
                { ms: Date.now() - startedAt },
            );
        }
        const monthKey = forecastDay.monthKey;
        const issued = await this.log.issuedObjects(ctx.domain, monthKey);
        let levers = 0;
        let written = 0;
        for (const { managerId, payload } of forecastDay.managers) {
            for (const lever of payload.levers) {
                levers += 1;
                const key = leverKeyOf(lever);
                if (parseLeverKey(key) === null) continue;
                const object = leverObject(managerId, key);
                if (issued.has(object)) continue;
                await this.log.markIssued(
                    { domain: ctx.domain, managerId, key, monthKey },
                    {
                        day: forecastDay.day,
                        lever: lever.lever,
                        ruleCode: lever.ruleCode,
                        deltaSales: lever.deltaSales,
                        ci80: lever.ci80,
                        evidence: lever.evidence,
                        calcVersion: ctx.calcVersion,
                    },
                );
                issued.add(object);
                written += 1;
            }
        }

        return stepOk(this.code, {
            ms: Date.now() - startedAt,
            rows: levers,
            written,
        });
    }
}
